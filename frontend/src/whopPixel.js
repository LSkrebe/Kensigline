/** Install Whop pixel once — tracks page views + checkout attribution. */
export function installWhopPixel() {
  if (typeof window === 'undefined') return
  const bizId = String(import.meta.env.VITE_WHOP_COMPANY_ID ?? '').trim()
  if (!bizId || window.__mlWhopPixel) return
  window.__mlWhopPixel = true

  const s = document.createElement('script')
  s.async = true
  s.textContent = `!function(w,h,o,p){w.whopTrack=w.whopTrack||function(){(w.whopTrack.q=w.whopTrack.q||[]).push(arguments)};
var s=h.createElement(o);s.async=1;s.src=p;h.head.appendChild(s)}
(window,document,'script','https://pixel.whop.com/pixel.js');
whopTrack('init','${bizId}');
whopTrack('track','PageView');`
  document.head.appendChild(s)
}
