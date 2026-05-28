import { signOut } from '../lib/auth'

interface NoAccessScreenProps {
  email?: string | null
}

export function NoAccessScreen({ email }: NoAccessScreenProps) {
  return (
    <div className="flex flex-col h-[100dvh] bg-treeBg items-center justify-center p-6 text-center">
      <img
        src="/Trees.jpg"
        alt="Trees Engineering"
        className="h-20 w-auto mb-8 drop-shadow-md"
      />
      <h1 className="text-2xl font-bold text-treeText mb-3">
        You're not registered yet
      </h1>

      {email && (
        <p className="text-treeTextSec text-sm mb-2">
          Signed in as{' '}
          <span className="font-medium text-treeText">{email}</span>
        </p>
      )}

      <p className="text-treeTextSec max-w-sm mb-8">
        We couldn't find you in our recruiter database. Join Treelance to get
        set up — message us on WhatsApp and we'll register you.
      </p>

      <a
        href="https://wa.me/60122421849"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-primary text-white font-semibold rounded-xl px-6 py-3 hover:bg-primary/90 transition-colors shadow-sm"
      >
        Message us on WhatsApp →
      </a>

      <button
        onClick={() => {
          void signOut()
        }}
        className="mt-8 text-xs text-treeTextSec underline hover:text-treeText"
      >
        Sign out
      </button>
    </div>
  )
}
