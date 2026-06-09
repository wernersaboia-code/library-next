export default function ReadLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="h-screen w-screen overflow-hidden">{children}</div>;
}
