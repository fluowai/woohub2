import { redirect } from "next/navigation";

/** A antiga tela ilustrativa foi desativada: o painel deve exibir somente dados reais. */
export default function MockupPreviewPage() {
    redirect("/dashboard");
}
