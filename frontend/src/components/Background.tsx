/** Two slow, heavily blurred light sources. Decorative only. */
export default function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 left-[30%] h-[520px] w-[520px] animate-drift rounded-full bg-emerald/25 blur-[120px]" />
      <div
        className="absolute -bottom-48 right-[8%] h-[420px] w-[420px] animate-drift rounded-full bg-lime/10 blur-[120px]"
        style={{ animationDelay: '-9s' }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(20_66_47/0.5)_1px,transparent_0)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
    </div>
  );
}
