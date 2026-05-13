import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ReceiptInvoice = {
  id: string;
  patient_name: string;
  created_at: string;
  consultation_fee: number;
  medicine_cost: number;
  lab_cost: number;
  service_charge: number;
  amount: number;
  status: string;
  payment_ref?: string | null;
};

export function downloadReceipt(inv: ReceiptInvoice) {
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text("MediCare Health Portal", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("Official Receipt", 14, 25);
  doc.setTextColor(0);

  doc.setFontSize(11);
  doc.text(`Invoice #: ${inv.id.slice(0, 8).toUpperCase()}`, 14, 38);
  doc.text(`Date: ${new Date(inv.created_at).toLocaleDateString()}`, 14, 45);
  doc.text(`Patient: ${inv.patient_name}`, 14, 52);
  doc.text(`Status: ${inv.status.toUpperCase()}`, 14, 59);
  if (inv.payment_ref) doc.text(`Payment ref: ${inv.payment_ref}`, 14, 66);

  autoTable(doc, {
    startY: 76,
    head: [["Description", "Amount (GHS)"]],
    body: [
      ["Consultation fee", Number(inv.consultation_fee).toFixed(2)],
      ["Medicine cost", Number(inv.medicine_cost).toFixed(2)],
      ["Lab tests", Number(inv.lab_cost).toFixed(2)],
      ["Service charge (10%)", Number(inv.service_charge).toFixed(2)],
    ],
    foot: [["TOTAL", Number(inv.amount).toFixed(2)]],
    theme: "striped",
    headStyles: { fillColor: [37, 99, 235] },
    footStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
  });

  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("Thank you for choosing MediCare. This is a computer-generated receipt.", 14, pageHeight - 14);

  doc.save(`receipt-${inv.id.slice(0, 8)}.pdf`);
}
