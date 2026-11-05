import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../index.css";
import "../organization.css";

export const metadata: Metadata = {
  title: "EV Park สำหรับบริษัท GJTH",
  description: "ระบบจองเวลาใช้หัวชาร์จรถยนต์ไฟฟ้าร่วมกันสำหรับพนักงานในบริษัท",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
