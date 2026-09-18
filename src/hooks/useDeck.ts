import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getDeck, listCards } from "../lib/api";

export function useDeck() {
  const { id } = useParams();

  const [deck, setDeck] = useState<any>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!id) return;

    setLoading(true);

    try {
      const deckData = await getDeck(id);
      const cardsData = await listCards(id);

      setDeck(deckData);
      setCards(cardsData);
    } catch (error) {
      console.error("Erro ao carregar deck:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  // Recarrega quando o banco local muda por push/pull (ex: uma carta ou
  // deck apagado/atualizado em outro dispositivo chega aqui sozinho, sem
  // precisar sair e voltar para a tela).
  useEffect(() => {
    function handleSyncFinished() {
      void load();
    }

    window.addEventListener("theo-sync-finished", handleSyncFinished);

    return () => {
      window.removeEventListener("theo-sync-finished", handleSyncFinished);
    };
  }, [id]);

  return {
    deck,
    cards,
    loading,
    error: !deck ? "Deck não encontrado" : null,
    reload: load,
  };
}
