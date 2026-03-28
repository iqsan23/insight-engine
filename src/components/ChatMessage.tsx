import ReactMarkdown from "react-markdown";
import { User, Bot } from "lucide-react";
import type { Message } from "@/lib/chat";

export const ChatMessage = ({ message }: { message: Message }) => {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="flex items-start">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-primary" />
          </div>
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-chat-user text-primary-foreground rounded-br-md"
            : "bg-chat-assistant text-chat-assistant-foreground rounded-bl-md"
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none text-chat-assistant-foreground">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex items-start">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-primary-foreground" />
          </div>
        </div>
      )}
    </div>
  );
};
