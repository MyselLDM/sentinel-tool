import { Chatbot } from "@/components/chatbot";

export default function Home() {
  return (
    <main className="bg-hatch flex-1">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 md:gap-8 md:py-14">
        <Chatbot />
      </div>
    </main>
  );
}
