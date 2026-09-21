import { redirect } from "next/navigation";

export default function Onboarding() {
  redirect("/operator/organisations/new");
}
