import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createDatabase, createUser } from './db/harness'

/**
 * Database tests: run every migration inside PGlite (real PostgreSQL compiled to
 * WASM) and exercise RLS, triggers and RPCs as anon / student / admin / service.
 * Test fixtures are synthetic and exist only inside this in-memory database.
 */
let db: PGlite
let superAdmin: string
let admin: string
let studentA: string
let studentB: string
let sourceId: string

/** Postgres array literal (PGlite cannot serialise JS arrays for enum[] params). */
const arr = (values: Array<string | number>) => `{${values.join(',')}}`

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows

beforeAll(async () => {
  db = await createDatabase()
  superAdmin = await createUser(db, 'owner@example.test', 'Owner')
  admin = await createUser(db, 'admin@example.test', 'Admin')
  studentA = await createUser(db, 'a@example.test', 'Student A')
  studentB = await createUser(db, 'b@example.test', 'Student B')
  // Bootstrap the first super admin from a trusted SQL session (no JWT).
  await q(`update public.profiles set role = 'super_admin' where id = $1`, [superAdmin])
  await as(db, { kind: 'user', id: superAdmin }, () => q(`select public.set_user_role($1, 'admin')`, [admin]))
})

describe('schema & reference data', () => {
  it('creates a student profile for every new auth user', async () => {
    const rows = await q<{ role: string; full_name: string }>(`select role, full_name from public.profiles where id = $1`, [studentA])
    expect(rows[0]).toEqual({ role: 'student', full_name: 'Student A' })
  })

  it('seeds the branch catalogue and monitored official sources', async () => {
    const [{ n }] = await q<{ n: number }>(`select count(*)::int n from public.branches`)
    expect(n).toBeGreaterThan(60)
    const sources = await q<{ url: string; enabled: boolean }>(`select url, enabled from public.monitored_sources order by url`)
    expect(sources.some((s) => s.url.startsWith('https://uptac.samarth.edu.in/'))).toBe(true)
    expect(sources.find((s) => s.url === 'https://uptac.admissions.nic.in/')?.enabled).toBe(false)
  })

  it('norm_key mirrors the TypeScript normaliser for official spellings', async () => {
    const [r] = await q<{ a: string; b: string }>(
      `select public.norm_key('Electrical & Computer Engg.') a, public.norm_key('Electrical and Computer Engineering') b`,
    )
    expect(r.a).toBe(r.b)
  })
})

describe('roles & profile protection', () => {
  it('students cannot escalate their own role', async () => {
    await expect(
      as(db, { kind: 'user', id: studentA }, () => q(`update public.profiles set role = 'admin' where id = $1`, [studentA])),
    ).rejects.toThrow(/super admin/)
  })

  it('students can update their own profile but not others', async () => {
    await as(db, { kind: 'user', id: studentA }, async () => {
      await q(`update public.profiles set full_name = 'Renamed' where id = $1`, [studentA])
      const res = await db.query(`update public.profiles set full_name = 'Hacked' where id = $1`, [studentB])
      expect(res.affectedRows).toBe(0)
    })
    const [b] = await q<{ full_name: string }>(`select full_name from public.profiles where id = $1`, [studentB])
    expect(b.full_name).toBe('Student B')
  })

  it('only super admins can change roles and the last super admin is protected', async () => {
    await expect(
      as(db, { kind: 'user', id: admin }, () => q(`select public.set_user_role($1, 'admin')`, [studentA])),
    ).rejects.toThrow(/super admin/)
    await expect(
      as(db, { kind: 'user', id: superAdmin }, () => q(`select public.set_user_role($1, 'student')`, [superAdmin])),
    ).rejects.toThrow(/last super admin/)
  })

  it('records role changes in the audit log', async () => {
    const rows = await q(`select 1 from public.admin_audit_logs where entity_type = 'profiles' and entity_id = $1`, [admin])
    expect(rows.length).toBeGreaterThan(0)
  })
})

describe('official data authorization', () => {
  it('anonymous visitors cannot modify official data', async () => {
    await expect(
      as(db, { kind: 'anon' }, () =>
        q(`insert into public.colleges (code, name, institute_type) values ('999', 'X', 'private')`),
      ),
    ).rejects.toThrow()
  })

  it('students cannot insert colleges', async () => {
    await expect(
      as(db, { kind: 'user', id: studentA }, () =>
        q(`insert into public.colleges (code, name, institute_type) values ('998', 'Y College', 'private')`),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('admins manage colleges, data sources and cutoff records', async () => {
    await as(db, { kind: 'user', id: admin }, async () => {
      const [src] = await q<{ id: string }>(
        `insert into public.data_sources (title, document_type, academic_year, url)
         values ('Test OR-CR document', 'opening_closing_rank', 2030, 'https://example.test/orcr') returning id`,
      )
      sourceId = src.id
      await q(`insert into public.colleges (code, name, institute_type, city, district) values
        ('T01', 'TEST GOVERNMENT INSTITUTE OF TECHNOLOGY, ALPHA', 'government', 'ALPHA', 'Alpha'),
        ('T02', 'TEST PRIVATE COLLEGE OF ENGG, BETA', 'private', 'BETA', 'Beta')`)
      await q(
        `insert into public.cutoff_records (academic_year, round_number, college_code, branch_code, category, seat_type,
           gender, domicile, quota, rank_type, opening_rank, closing_rank, source_id)
         values (2030, 1, 'T01', 'CSE', 'OPEN', 'GENERAL', 'NEUTRAL', 'ANY', 'STATE', 'CRL', 100, 5000, $1)`,
        [sourceId],
      )
    })
  })

  it('pending records are hidden from the public until verified', async () => {
    const before = await as(db, { kind: 'anon' }, () => q(`select * from public.cutoff_records`))
    expect(before).toHaveLength(0)
    await as(db, { kind: 'user', id: admin }, () =>
      q(`update public.cutoff_records set verification_status = 'verified' where college_code = 'T01'`),
    )
    const after = await as(db, { kind: 'anon' }, () => q<{ verified_by: string }>(`select * from public.cutoff_records`))
    expect(after).toHaveLength(1)
    const [row] = await q<{ verified_by: string }>(`select verified_by from public.cutoff_records where college_code = 'T01'`)
    expect(row.verified_by).toBe(admin)
  })

  it('rejects invalid ranks', async () => {
    await expect(
      as(db, { kind: 'user', id: admin }, () =>
        q(
          `insert into public.cutoff_records (academic_year, round_number, college_code, branch_code, category, domicile,
             opening_rank, closing_rank, source_id)
           values (2030, 2, 'T01', 'CSE', 'OPEN', 'ANY', 9000, 10, $1)`,
          [sourceId],
        ),
      ),
    ).rejects.toThrow(/rank_order/)
  })

  it('data sources are admin-only but public metadata is exposed safely', async () => {
    const direct = await as(db, { kind: 'anon' }, () => q(`select * from public.data_sources`).catch(() => 'denied'))
    expect(direct).toBe('denied')
    const pub = await as(db, { kind: 'anon' }, () => q<Record<string, unknown>>(`select * from public.get_public_sources(null)`))
    expect(pub[0]).toHaveProperty('title', 'Test OR-CR document')
    expect(pub[0]).not.toHaveProperty('storage_path')
  })
})

describe('import → review → publish workflow', () => {
  let jobId: string

  it('stages extracted rows and detects duplicates', async () => {
    await as(db, { kind: 'user', id: admin }, async () => {
      const [job] = await q<{ id: string }>(
        `insert into public.import_jobs (data_source_id, file_name, storage_path, file_checksum, document_type, academic_year, status)
         values ($1, 'orcr.csv', 'imports/test/orcr.csv', repeat('a', 64), 'opening_closing_rank', 2030, 'in_review') returning id`,
        [sourceId],
      )
      jobId = job.id
      const base = `insert into public.import_staging_records (import_job_id, record_type, row_index, academic_year, round_number,
        college_code, college_name_raw, branch_code, branch_name_raw, branch_base_raw, category, seat_type, gender, domicile, quota,
        rank_type, exam, opening_rank, closing_rank, issues, has_errors) values `
      await q(
        base +
          `($1,'cutoff',1,2030,1,'T01','TEST GOVERNMENT INSTITUTE OF TECHNOLOGY, ALPHA','CSE','Computer Science and Engineering','Computer Science and Engineering','OPEN','GENERAL','NEUTRAL','ANY','STATE','CRL','JEE-MAIN',100,5000,'[]',false),
           ($1,'cutoff',2,2030,1,'T01','TEST GOVERNMENT INSTITUTE OF TECHNOLOGY, ALPHA','IT','Information Technology','Information Technology','OPEN','GENERAL','NEUTRAL','ANY','STATE','CRL','JEE-MAIN',2000,9000,'[]',false),
           ($1,'cutoff',3,2030,1,'T01','TEST GOVERNMENT INSTITUTE OF TECHNOLOGY, ALPHA','IT','Information Technology','Information Technology','OPEN','GENERAL','NEUTRAL','ANY','STATE','CRL','JEE-MAIN',2100,9100,'[]',false),
           ($1,'cutoff',4,2030,1,null,'TEST PRIVATE COLLEGE OF ENGG , BETA','ME','Mechanical Engineering (Shift I)','Mechanical Engineering','BC','GENERAL','NEUTRAL','UP','STATE','CRL','JEE-MAIN',40000,80000,'[{"code":"unknown_college","severity":"error","message":"x"}]',true)`,
        [jobId],
      )
      const dup = await q<{ refresh_staging_duplicates: Record<string, number> }>(`select public.refresh_staging_duplicates($1)`, [jobId])
      expect(dup[0].refresh_staging_duplicates).toEqual({ in_file: 2, existing_same: 1, existing_conflict: 0 })
      const skipped = await q(`select row_index from public.import_staging_records where import_job_id = $1 and status = 'skipped'`, [jobId])
      expect(skipped).toEqual([{ row_index: 1 }])
    })
  })

  it('resolves institute names after admin review', async () => {
    await as(db, { kind: 'user', id: admin }, async () => {
      const [r] = await q<{ revalidate_staging_references: Record<string, number> }>(
        `select public.revalidate_staging_references($1)`,
        [jobId],
      )
      expect(r.revalidate_staging_references.unresolved_college_rows).toBe(0)
      const [row] = await q<{ college_code: string; has_errors: boolean }>(
        `select college_code, has_errors from public.import_staging_records where import_job_id = $1 and row_index = 4`,
        [jobId],
      )
      expect(row).toEqual({ college_code: 'T02', has_errors: false })
    })
  })

  it('refuses to publish duplicate approved rows', async () => {
    await as(db, { kind: 'user', id: admin }, async () => {
      await q(`update public.import_staging_records set status = 'approved' where import_job_id = $1 and status = 'pending'`, [jobId])
      await expect(q(`select public.publish_import_job($1)`, [jobId])).rejects.toThrow(/duplicate key group/)
    })
  })

  it('students cannot publish', async () => {
    await expect(
      as(db, { kind: 'user', id: studentA }, () => q(`select public.publish_import_job($1)`, [jobId])),
    ).rejects.toThrow(/Not authorized/)
  })

  it('publishes approved rows as verified records with one audit entry', async () => {
    await as(db, { kind: 'user', id: admin }, async () => {
      await q(`update public.import_staging_records set status = 'rejected' where import_job_id = $1 and row_index = 3`, [jobId])
      const [res] = await q<{ publish_import_job: Record<string, number> }>(`select public.publish_import_job($1)`, [jobId])
      expect(res.publish_import_job).toEqual({ cutoff_records: 2, seat_matrix_rows: 0 })
    })
    const pub = await as(db, { kind: 'anon' }, () =>
      q<{ college_code: string; branch_code: string }>(
        `select college_code, branch_code from public.cutoff_records order by college_code, branch_code`,
      ),
    )
    expect(pub).toEqual([
      { college_code: 'T01', branch_code: 'CSE' },
      { college_code: 'T01', branch_code: 'IT' },
      { college_code: 'T02', branch_code: 'ME' },
    ])
    const audit = await q(`select 1 from public.admin_audit_logs where action = 'PUBLISH' and entity_id = $1`, [jobId])
    expect(audit).toHaveLength(1)
    const [job] = await q<{ status: string }>(`select status from public.import_jobs where id = $1`, [jobId])
    expect(job.status).toBe('published')
  })

  it('prevents importing the same file twice while the first import is active', async () => {
    await expect(
      as(db, { kind: 'user', id: admin }, () =>
        q(
          `insert into public.import_jobs (data_source_id, file_name, storage_path, file_checksum, document_type, academic_year)
           values ($1, 'again.csv', 'imports/x/again.csv', repeat('a', 64), 'opening_closing_rank', 2030)`,
          [sourceId],
        ),
      ),
    ).rejects.toThrow(/import_jobs_active_checksum_key/)
  })
})

describe('prediction data access', () => {
  const call = (rank: number, categories: string[], domiciles: string[], types = ['government', 'private', 'aided', 'university']) =>
    as(db, { kind: 'anon' }, () =>
      q<{ prediction_candidates: { total_groups: number; records: Array<Record<string, unknown>>; sources: unknown[] } }>(
        `select public.prediction_candidates($1::smallint[], $2::public.reservation_category[], $3::public.seat_type[],
           $4::public.seat_gender[], $5::public.domicile_requirement[], $6::public.seat_quota[], $7::public.institute_type[],
           $8, null, null, 0.10, 400)`,
        [arr([2030]), arr(categories), arr(['GENERAL']), arr(['NEUTRAL']), arr(domiciles), arr(['STATE', 'HOME_STATE', 'ALL_INDIA']), arr(types), rank],
      ),
    )

  it('returns only eligible seat groups within the near band', async () => {
    const [r] = await call(8500, ['OPEN'], ['ANY'])
    const groups = r.prediction_candidates.records.map((x) => `${x.college_code}-${x.branch_code}`)
    // CSE closes at 5000 (< 8500/1.1) → excluded; IT closes at 9000 → included; ME is BC/UP-only → excluded.
    expect(groups).toEqual(['T01-IT'])
    expect(r.prediction_candidates.sources).toHaveLength(1)
  })

  it('includes reserved-category seats only when eligible', async () => {
    const [r] = await call(50000, ['OPEN', 'BC'], ['ANY', 'UP'])
    const groups = r.prediction_candidates.records.map((x) => `${x.college_code}-${x.branch_code}`)
    expect(groups).toContain('T02-ME')
  })

  it('respects the institute type preference', async () => {
    const [r] = await call(50000, ['OPEN', 'BC'], ['ANY', 'UP'], ['government'])
    expect(r.prediction_candidates.records.every((x) => x.college_code === 'T01')).toBe(true)
  })

  it('public stats and overview are computed from verified data only', async () => {
    const [s] = await as(db, { kind: 'anon' }, () => q<{ get_public_stats: Record<string, unknown> }>(`select public.get_public_stats()`))
    expect(s.get_public_stats.verified_cutoff_records).toBe(3)
    expect(s.get_public_stats.years).toEqual([2030])
    const [o] = await as(db, { kind: 'anon' }, () => q<{ get_cutoff_overview: { year: number; branches: unknown[] } }>(`select public.get_cutoff_overview(null)`))
    expect(o.get_cutoff_overview.year).toBe(2030)
    expect(o.get_cutoff_overview.branches.length).toBe(2)
    const [y] = await as(db, { kind: 'anon' }, () => q<{ get_cutoff_years: unknown[] }>(`select public.get_cutoff_years()`))
    expect(y.get_cutoff_years).toEqual([{ year: 2030, rounds: [{ round_number: 1, round_label: null }] }])
  })
})

describe('student data isolation', () => {
  let listId: string

  it('students manage their own choice lists and reorder items', async () => {
    await as(db, { kind: 'user', id: studentA }, async () => {
      const [list] = await q<{ id: string }>(`insert into public.choice_lists (user_id, name) values ($1, 'Plan A') returning id`, [studentA])
      listId = list.id
      const items = await q<{ id: string }>(
        `insert into public.choice_list_items (list_id, position, college_code, branch_code) values
           ($1, 0, 'T01', 'CSE'), ($1, 1, 'T01', 'IT'), ($1, 2, 'T02', 'ME') returning id`,
        [listId],
      )
      await q(`select public.reorder_choice_list($1, $2::uuid[])`, [listId, [items[2].id, items[0].id, items[1].id]])
      const ordered = await q<{ branch_code: string }>(
        `select branch_code from public.choice_list_items where list_id = $1 order by position`,
        [listId],
      )
      expect(ordered.map((o) => o.branch_code)).toEqual(['ME', 'CSE', 'IT'])
    })
  })

  it('other students cannot read or modify the list', async () => {
    await as(db, { kind: 'user', id: studentB }, async () => {
      expect(await q(`select * from public.choice_lists where id = $1`, [listId])).toHaveLength(0)
      expect(await q(`select * from public.choice_list_items where list_id = $1`, [listId])).toHaveLength(0)
      await expect(
        q(`insert into public.choice_list_items (list_id, position, college_code, branch_code) values ($1, 9, 'T01', 'EE')`, [listId]),
      ).rejects.toThrow(/row-level security/)
      await expect(q(`select public.reorder_choice_list($1, '{}'::uuid[])`, [listId])).rejects.toThrow(/not found/)
    })
  })

  it('prediction logs are private to their owner', async () => {
    await as(db, { kind: 'service' }, () =>
      q(`insert into public.prediction_logs (user_id, input, result_count) values ($1, '{"rank":1}', 3)`, [studentA]),
    )
    const mine = await as(db, { kind: 'user', id: studentA }, () => q(`select * from public.prediction_logs`))
    const theirs = await as(db, { kind: 'user', id: studentB }, () => q(`select * from public.prediction_logs`))
    expect(mine).toHaveLength(1)
    expect(theirs).toHaveLength(0)
  })
})

describe('private document storage', () => {
  it('only admins can upload official documents', async () => {
    await as(db, { kind: 'user', id: admin }, () =>
      q(`insert into storage.objects (bucket_id, name) values ('official-documents', 'imports/x.pdf')`),
    )
    await expect(
      as(db, { kind: 'user', id: studentA }, () =>
        q(`insert into storage.objects (bucket_id, name) values ('official-documents', 'imports/y.pdf')`),
      ),
    ).rejects.toThrow(/row-level security/)
    const visible = await as(db, { kind: 'user', id: studentA }, () => q(`select * from storage.objects`))
    expect(visible).toHaveLength(0)
  })

  it('the bucket is private', async () => {
    const [b] = await q<{ public: boolean }>(`select public from storage.buckets where id = 'official-documents'`)
    expect(b.public).toBe(false)
  })
})

describe('admin analytics', () => {
  it('dashboard stats require admin', async () => {
    await expect(as(db, { kind: 'user', id: studentA }, () => q(`select public.admin_dashboard_stats()`))).rejects.toThrow(
      /Not authorized/,
    )
    const [r] = await as(db, { kind: 'user', id: admin }, () => q<{ admin_dashboard_stats: Record<string, unknown> }>(`select public.admin_dashboard_stats()`))
    expect(r.admin_dashboard_stats.cutoffs_verified).toBe(3)
    expect((r.admin_dashboard_stats.predictions_by_day as unknown[]).length).toBe(30)
  })
})
