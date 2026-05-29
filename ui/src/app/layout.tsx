// app/layout.tsx
import "./globals.css";
import Image from "next/image";
import { PrimeReactProvider } from "primereact/api";
import "primereact/resources/themes/lara-light-cyan/theme.css";
import { Divider } from "primereact/divider";
import Link from "next/link";
import SidebarItem from "./components/SidebarItem";
import ConfigGuard from "./components/ConfigGuard";
import "primeicons/primeicons.css";

export const metadata = {
  title: "KWEST",
  description: "Simulation Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const testSidebarItems = [
    { title: "Home", path: "/" },
    { title: "Run a Simulation", path: "/runsim" },
    { title: "View Simulations", path: "/findsim" },
    { title: "Clusters", path: "/clusters" },
    { title: "Workloads", path: "/workloads" },
    { title: "Schedulers", path: "/schedulers" },
    { title: "Simulation Configs", path: "/simconfigs" },
    { title: "Settings", path: "/settings" },
  ];

  return (
    <html lang="en">
      <body>
        <PrimeReactProvider>
          <div className="flex flex-row h-screen">
            {/* Sidebar */}
            <div className="w-1/6 border-r border-gray-300 flex flex-col">
              <Link href="/" className="block p-4">
                <Image
                  src="/hyper-ai-logo.png"
                  alt="Logo"
                  width={100}
                  height={100}
                  className="mx-auto"
                />
              </Link>
              {testSidebarItems.map((item, index) => (
                <div key={index}>
                  <SidebarItem title={item.title} path={item.path} />
                  {testSidebarItems[index + 1] && <Divider className="w-1/2" />}
                </div>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              <ConfigGuard>{children}</ConfigGuard>
            </div>
          </div>
        </PrimeReactProvider>
      </body>
    </html>
  );
}
