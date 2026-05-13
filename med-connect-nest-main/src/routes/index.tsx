import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CalendarCheck, FileText, FlaskConical, Pill, ShieldCheck, Stethoscope, Wallet } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Stethoscope className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold">MediCare</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost"><Link to="/login">Log in</Link></Button>
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90"><Link to="/signup">Get started</Link></Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">For students & clinics</span>
            <h1 className="mt-4 text-4xl font-bold leading-tight md:text-5xl">
              Modern healthcare, <span className="text-primary">calm and connected.</span>
            </h1>
            <p className="mt-4 text-base text-muted-foreground md:text-lg">
              Book appointments, view your medical records and lab results, and pay with Mobile Money — all in one secure place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to="/signup">Create patient account</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/login">Staff log in</Link>
              </Button>
            </div>
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" />
              End-to-end secure. Your data stays private.
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: CalendarCheck, title: "Appointments", text: "Book a doctor in seconds." },
              { icon: FileText, title: "Records", text: "All your visits in one timeline." },
              { icon: FlaskConical, title: "Lab Results", text: "Download PDFs anytime." },
              { icon: Wallet, title: "Mobile Money", text: "Pay with MTN, Voda, AT." },
              { icon: Pill, title: "Pharmacy", text: "Live drug stock for staff." },
              { icon: Stethoscope, title: "Doctors", text: "Browse by specialty." },
            ].map(({ icon: Icon, title, text }) => (
              <Card key={title} className="p-5">
                <Icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t bg-white py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} MediCare. Built for student healthcare clinics in Ghana.
      </footer>
    </div>
  );
}
