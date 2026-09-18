import { useState, type FormEvent } from "react";
import {
    Button,
    ErrorBanner,
    Input,
    Label,
    Panel,
} from "../ui";

import {
    extractErrorMessage,
    publishDeckToCommunity,
} from "../../lib/api";

import {
    CheckCircle,
    Upload,
    X,
} from "lucide-react";


interface PublishModalProps {
    open: boolean;
    deckId: string;
    onClose: () => void;
}


const categories = [
    "Direito",
    "Concursos",
    "Medicina",
    "Idiomas",
    "Tecnologia",
    "História",
    "Outros",
];


export default function PublishModal({
    open,
    deckId,
    onClose,
}: PublishModalProps) {

    const [title, setTitle] = useState("");
    const [category, setCategory] = useState("");

    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);


    if (!open) return null;


    async function onSubmit(e: FormEvent) {

        e.preventDefault();

        setError(null);
        setLoading(true);


        try {

            await publishDeckToCommunity({
                deck_id: deckId,
                title: title.trim(),
                category: category || undefined,
            });


            setDone(true);


            setTimeout(() => {
                onClose();

                setDone(false);
                setTitle("");
                setCategory("");

            }, 1500);


        } catch (err) {

            setError(
                extractErrorMessage(err)
            );

        } finally {

            setLoading(false);

        }
    }


    return (

        <div
            className="
                fixed inset-0
                z-50
                flex
                items-center
                justify-center
                bg-black/50
                backdrop-blur-sm
                p-4
            "
        >

            <Panel
                className="
                    w-full
                    max-w-lg
                    rounded-2xl
                    shadow-xl
                    border
                    space-y-5
                    animate-in
                    fade-in
                    zoom-in-95
                "
            >


                {done ? (

                    <div
                        className="
                            flex
                            flex-col
                            items-center
                            text-center
                            py-8
                            gap-3
                        "
                    >

                        <CheckCircle
                            size={55}
                            className="text-green-500"
                        />


                        <h3
                            className="
                                text-xl
                                font-bold
                            "
                        >
                            Deck publicado!
                        </h3>


                        <p
                            className="
                                text-sm
                                text-text-muted
                            "
                        >
                            Seu deck agora está disponível
                            para a comunidade.
                        </p>


                    </div>


                ) : (

                    <form
                        onSubmit={onSubmit}
                        className="space-y-5"
                    >


                        <div
                            className="
                                flex
                                items-start
                                justify-between
                            "
                        >

                            <div>

                                <div
                                    className="
                                        flex
                                        items-center
                                        gap-2
                                    "
                                >

                                    <Upload
                                        size={22}
                                        className="text-primary"
                                    />

                                    <h2
                                        className="
                                            text-xl
                                            font-bold
                                        "
                                    >
                                        Publicar Deck
                                    </h2>

                                </div>


                                <p
                                    className="
                                        text-sm
                                        text-text-muted
                                        mt-1
                                    "
                                >
                                    Compartilhe seu conteúdo
                                    com outros estudantes.
                                </p>

                            </div>


                            <button
                                type="button"
                                onClick={onClose}
                                className="
                                    rounded-lg
                                    p-2
                                    hover:bg-muted
                                "
                            >
                                <X size={20} />
                            </button>


                        </div>



                        {error && (
                            <ErrorBanner
                                message={error}
                            />
                        )}



                        <div className="space-y-2">

                            <Label>
                                Título público
                            </Label>


                            <Input
                                autoFocus
                                required
                                value={title}
                                onChange={(e) =>
                                    setTitle(e.target.value)
                                }
                                placeholder="
                                    Ex: Direito Constitucional - CF/88
                                "
                            />


                            <p
                                className="
                                    text-xs
                                    text-text-muted
                                "
                            >
                                Nome que aparecerá na comunidade.
                            </p>

                        </div>




                        <div className="space-y-2">

                            <Label>
                                Categoria
                            </Label>


                            <select
                                value={category}
                                onChange={(e) =>
                                    setCategory(e.target.value)
                                }
                                className="
                                    w-full
                                    rounded-xl
                                    border
                                    bg-background
                                    px-3
                                    py-2
                                    text-sm
                                "
                            >

                                <option value="">
                                    Selecione uma categoria
                                </option>


                                {categories.map(item => (

                                    <option
                                        key={item}
                                        value={item}
                                    >
                                        {item}
                                    </option>

                                ))}


                            </select>

                        </div>




                        <div
                            className="
                                flex
                                justify-end
                                gap-3
                                pt-3
                            "
                        >

                            <Button
                                type="button"
                                variant="secondary"
                                onClick={onClose}
                            >
                                Cancelar
                            </Button>



                            <Button
                                type="submit"
                                disabled={
                                    loading ||
                                    !title.trim()
                                }
                            >

                                {loading
                                    ? "Publicando..."
                                    : "Publicar Deck"
                                }

                            </Button>


                        </div>


                    </form>

                )}


            </Panel>


        </div>

    );
}