import { H1, H6 } from './Headings'
import { useSetWindowTitle } from '../hooks/WindowTitle'

const NostrQuote = () => (
  <blockquote className="relative p-4 mb-4 border-l font-serif quote">
    <span className="block absolute top-0 leading-none opacity-10 text-8xl" aria-hidden="true">
      &ldquo;
    </span>
    <p className="mb-4 pl-2 pt-2">
      The simplest open protocol that is able to create a censorship-resistant global network once and for all.
    </p>
    <cite className="flex items-center">
      <span className="flex flex-col items-start">
        <span className="text-sm">— nostr protocol readme</span>
      </span>
    </cite>
  </blockquote>
)

export default function FaqPage() {
  useSetWindowTitle({ text: 'FAQ' })

  return (
    <div className="screen-faq">
      <H1>FAQ</H1>

      <H6>What is this?</H6>
      <p className="mb-8 font-serif">A chess app on nostr.</p>

      <H6>What is nostr?</H6>
      <NostrQuote />
      <p className="mb-8 font-serif">
        <a className="underline" target="_blank" rel="noopener noreferrer" href="https://github.com/fiatjaf/nostr">
          Read more about nostr on GitHub.
        </a>
      </p>

      <H6>How can I do X?</H6>
      <p className="mb-8 font-serif">You probably can't. The current functionality is very limited.</p>

      <H6>I found a bug. How can I report it?</H6>
      <p className="mb-8 font-serif">
        Please open an issue{' '}
        <a
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
          href="https://github.com/jesterui/jesterui/issues"
        >
          on the project's GitHub repo
        </a>
        .
      </p>

      <H6>This is in beta. Is this just a demo application?</H6>
      <p className="mb-8 font-serif">Yes.</p>

      <H6>Where are the robots coming from?</H6>
      <p className="mb-8 font-serif">
        Robots lovingly delivered by{' '}
        <a className="underline" target="_blank" rel="noopener noreferrer" href="https://robohash.org/">
          https://robohash.org
        </a>
        .
      </p>
    </div>
  )
}
