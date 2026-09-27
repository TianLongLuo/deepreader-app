import ThemeProvider from "@/components/layout/theme-provider";
import "./globals.css";
import { cn } from "@/lib/utils";



export const metadata = {
  title: "DeepReader - AI Assisted Reading",
  description: "A paragraph-level reading enhancement system.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html: `try{var p=JSON.parse(localStorage.getItem('deepreader-ui')||'{}').state||{};var d=p.theme==='dark'||(p.theme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch{}`}} /></head>
      <body className={cn("min-h-screen bg-background text-foreground antialiased")}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
