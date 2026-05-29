import React from "react";
import Link from "next/link";

export default function SidebarItem(props: any) {
  return (
    <Link href={props.path}>
      <div className="flex flex-col p-4 hover:bg-gray-200 cursor-pointer">
        <div className="flex justify-center">{props.title}</div>
      </div>
    </Link>
  );
}
