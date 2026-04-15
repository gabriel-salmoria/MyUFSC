import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";

interface ProfessorRatingBadgeProps {
  overall: number | null;
  className?: string;
  onClick?: () => void;
}

export function ProfessorRatingBadge({
  overall,
  className,
  onClick,
}: ProfessorRatingBadgeProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.stopPropagation();
      onClick();
    }
  };

  if (overall === null || overall === undefined) {
    return (
      <Badge
        variant="outline"
        className={`ml-2 cursor-pointer transition-colors bg-secondary text-secondary-foreground hover:bg-secondary/80 ${className || ""}`}
        onClick={handleClick}
      >
        Novo
      </Badge>
    );
  }

  const getVariantAndColor = (score: number) => {
    if (score >= 4.0)
      return "bg-green-100 text-green-800 hover:bg-green-200 border-green-200";
    if (score >= 3.0)
      return "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200";
    return "bg-red-100 text-red-800 hover:bg-red-200 border-red-200";
  };

  return (
    <Badge
      variant="outline"
      className={`ml-2 cursor-pointer transition-colors ${getVariantAndColor(overall)} ${className || ""}`}
      onClick={handleClick}
    >
      <Star className="w-3 h-3 mr-1 fill-current" />
      {overall.toFixed(1)}
    </Badge>
  );
}
