import { redirect } from "next/navigation"
import { getViewer, homeFor } from "@/lib/supabase/server"

export default async function Home() {
  redirect(homeFor(await getViewer()))
}
