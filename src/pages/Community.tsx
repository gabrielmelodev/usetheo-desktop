import { Download, Search, Star, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, EmptyState, ErrorBanner, Input, Panel, Spinner } from "../components/ui";
import { downloadCommunityListing, extractErrorMessage, rateCommunityListing, searchCommunityListings } from "../lib/api";
import type { CommunityListing } from "../lib/types";

export default function Community() {
  const [query, setQuery] = useState("");
  const [listings, setListings] = useState<CommunityListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadedDeckId, setDownloadedDeckId] = useState<string | null>(null);

  function reload(q?: string) {
    searchCommunityListings(q)
      .then(setListings)
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(() => reload(), []);

  async function onDownload(listingId: string) {
    setError(null);
    try {
      const res = await downloadCommunityListing(listingId);
      setDownloadedDeckId(res.deck_id);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function onRate(listingId: string, stars: number) {
    setError(null);
    try {
      await rateCommunityListing(listingId, stars);
      reload(query || undefined);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-text">Comunidade</h1>
        <p className="mt-1 text-sm text-text-muted">Descubra decks publicados por outras pessoas.</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          reload(query || undefined);
        }}
        className="mb-6 flex gap-2"
      >
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar decks públicos..."
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} />
        </div>
      )}

      {downloadedDeckId && (
        <div className="mb-6 rounded-lg border border-good/30 bg-good/10 px-4 py-3 text-sm text-good">
          Deck importado com sucesso!{" "}
          <Link to={`/decks/${downloadedDeckId}`} className="font-medium underline">
            Ver deck
          </Link>
        </div>
      )}

      {listings === null ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Spinner />
        </div>
      ) : listings.length === 0 ? (
        <EmptyState
          icon={<Users size={32} strokeWidth={1.5} />}
          title="Nenhum deck encontrado"
          description="Tente outro termo de busca, ou publique o seu próprio deck a partir da página do deck."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {listings.map((listing) => (
            <Panel key={listing.id}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg font-medium text-text">{listing.title}</h3>
                {listing.category && <Badge>{listing.category}</Badge>}
              </div>
              {listing.description && (
                <p className="mt-1.5 line-clamp-2 text-sm text-text-muted">{listing.description}</p>
              )}
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-3 font-mono text-xs text-text-faint">
                  <span className="flex items-center gap-1">
                    <Download size={13} /> {listing.downloads_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star size={13} className="text-streak" />
                    {listing.rating_avg.toFixed(1)} ({listing.rating_count})
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => onRate(listing.id, star)}
                      className="text-text-faint transition-colors hover:text-streak"
                      aria-label={`Avaliar com ${star} estrelas`}
                    >
                      <Star size={14} />
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="secondary" className="mt-4 w-full" onClick={() => onDownload(listing.id)}>
                <Download size={15} /> Importar para minha conta
              </Button>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
