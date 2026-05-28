import { MessageCircle } from 'lucide-react'
import { telemetry } from '../lib/telemetry'

const WHATSAPP_URL = 'https://wa.me/60122421849'
const WHATSAPP_GREEN = '#25D366'

/** Top-of-page "Talk to Treelance" WhatsApp link — sits next to UploadJDButton. */
export function TalkToTreelanceButton() {
  return (
    <a
      data-telemetry-id="talk-to-treelance"
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => telemetry.capture('talk_to_treelance_clicked', {})}
      style={{ backgroundColor: WHATSAPP_GREEN }}
      className="flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-1.5 rounded-lg active:opacity-90 transition-opacity"
    >
      <MessageCircle size={14} />
      Talk to Treelance
    </a>
  )
}
