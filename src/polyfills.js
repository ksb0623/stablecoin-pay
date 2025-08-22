import process from "process";

if (typeof window !== "undefined" && !window.process) {
  window.process = process;
}
