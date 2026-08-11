import{requireUser}from"@/lib/firebase/session";export default async function Layout({children}:{children:React.ReactNode}){await requireUser();return children}
