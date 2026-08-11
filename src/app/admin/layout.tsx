import{requireAdmin}from"@/lib/firebase/session";export default async function Layout({children}:{children:React.ReactNode}){await requireAdmin();return children}
