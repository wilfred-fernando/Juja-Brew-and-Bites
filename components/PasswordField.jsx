"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export default function PasswordField({
  value,
  onChange,
  className = "",
  placeholder = "Password",
  required = true,
  disabled = false,
  autoComplete = "current-password",
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        className={`${className} pr-12`}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 active:scale-95"
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
