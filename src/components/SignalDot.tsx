import { SignalStatus } from "../utils/taskUtils";

const SIGNAL_TITLE: Record<Exclude<SignalStatus, "none">, string> = {
  red:    "遅延",
  yellow: "着手遅れ",
  green:  "正常",
};

interface Props {
  status: SignalStatus;
  className?: string;
}

export default function SignalDot({ status, className }: Props) {
  if (status === "none") return null;
  return (
    <span
      className={`status-signal status-signal--${status}${className ? ` ${className}` : ""}`}
      title={SIGNAL_TITLE[status]}
    />
  );
}
