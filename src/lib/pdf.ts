/** PDF export for choice lists (jsPDF is loaded lazily to keep the main bundle small). */
export interface ChoicePdfRow {
  position: number
  collegeCode: string
  collegeName: string
  branchName: string
  branchCode: string
  shift: string
  reference: string
  notes: string | null
}

export async function exportChoiceListPdf(opts: {
  listName: string
  studentName?: string | null
  seatLabel: string
  rows: ChoicePdfRow[]
}): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const navy: [number, number, number] = [11, 23, 57]
  const royal: [number, number, number] = [42, 75, 224]

  doc.setFillColor(...navy)
  doc.rect(0, 0, pageWidth, 70, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('UPTAC Predictor – Choice List', 40, 32)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Your Rank. Your College. Your Future.', 40, 50)
  doc.text(`Generated ${new Date().toLocaleString('en-IN')}`, pageWidth - 40, 50, { align: 'right' })

  doc.setTextColor(...navy)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(opts.listName, 40, 98)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(74, 94, 145)
  const meta = [opts.studentName ? `Student: ${opts.studentName}` : null, `Reference cutoff: ${opts.seatLabel}`, `${opts.rows.length} choices`].filter(Boolean).join('   ·   ')
  doc.text(meta, 40, 114)

  autoTable(doc, {
    startY: 128,
    head: [['#', 'College (code)', 'Branch', 'Shift', 'Latest reference closing rank', 'Notes']],
    body: opts.rows.map((r) => [
      String(r.position),
      `${r.collegeName} (${r.collegeCode})`,
      `${r.branchName} (${r.branchCode})`,
      r.shift || '—',
      r.reference,
      r.notes ?? '',
    ]),
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 5, textColor: navy, lineColor: [227, 233, 245], lineWidth: 0.5 },
    headStyles: { fillColor: royal, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [242, 245, 251] },
    columnStyles: { 0: { cellWidth: 26, halign: 'center' }, 3: { cellWidth: 40 }, 4: { cellWidth: 150 } },
    margin: { left: 40, right: 40, bottom: 60 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight()
      doc.setFontSize(7.5)
      doc.setTextColor(108, 128, 176)
      doc.text(
        'ADVISORY ONLY – This is not the official UPTAC choice submission. Submit choices on the official portal (uptac.samarth.edu.in). Reference closing ranks are verified historical data and do not guarantee admission.',
        40,
        h - 30,
        { maxWidth: pageWidth - 80 },
      )
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - 40, h - 14, { align: 'right' })
    },
  })

  const safe = opts.listName.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'choice-list'
  doc.save(`${safe}.pdf`)
}
