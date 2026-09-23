import type {Metadata,Viewport} from "next";import "./globals.css";import SiteToast from "./components/site-toast";
export const metadata:Metadata={title:{default:"Drop24 — Portfolio Demo",template:"%s | Drop24"},description:"Browser-only portfolio demo of Drop24.",icons:{icon:"favicon.svg"}};
export const viewport:Viewport={width:"device-width",initialScale:1,themeColor:"#f5f3ed"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}<SiteToast/></body></html>}
