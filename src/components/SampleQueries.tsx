import { Clock, Search, Users, DoorOpen } from "lucide-react";

const queries = [
  { icon: Clock, text: "When did employee 101 enter today?", color: "text-primary" },
  { icon: Search, text: "Show all entries after 5 PM", color: "text-accent" },
  { icon: Users, text: "Who entered between 9 and 10 AM?", color: "text-primary" },
  { icon: DoorOpen, text: "Did employee 202 exit yesterday?", color: "text-accent" },
];

export const SampleQueries = ({ onSelect }: { onSelect: (q: string) => void }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
    {queries.map(({ icon: Icon, text, color }) => (
      <button
        key={text}
        onClick={() => onSelect(text)}
        className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-secondary transition-colors text-left group"
      >
        <Icon className={`w-4 h-4 ${color} shrink-0`} />
        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{text}</span>
      </button>
    ))}
  </div>
);
