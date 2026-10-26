"use client";
import { useState } from "react";
import { engineRequest as api } from "./generation-engine";
export type MetaAliasOption = {
  id: string;
  name: string;
  inventorySheetId?: string;
  inventorySheet?: { id: string; name: string };
  tableId?: string;
  table?: { id: string; name: string };
};
export function MetaAliasDirectory({
  aliases,
  onSaved,
}: {
  aliases: MetaAliasOption[];
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const submit = async (form: HTMLFormElement, id?: string) => {
    setBusy(true);
    setMessage("");
    try {
      const name = String(new FormData(form).get("name") ?? "");
      await api(
        "meta-ads/aliases" + (id ? "/" + id : ""),
        id ? "PATCH" : "POST",
        { name },
      );
      if (!id) form.reset();
      onSaved();
      setMessage(
        "Inventario guardado. Puedes asignarlo desde las campañas, conjuntos o anuncios.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudo guardar el inventario.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel stack meta-alias-directory">
      <h2>Inventario de diplomados</h2>
      <p>
        Organiza tus campañas, conjuntos y anuncios con nombres comunes. Los
        elementos del inventario son internos y no cambian los nombres en Meta.
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <label>
          Nombre del diplomado
          <input
            name="name"
            required
            maxLength={150}
            placeholder="Escribe un elemento del inventario"
          />
        </label>
        <button disabled={busy}>Agregar inventario</button>
      </form>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {!aliases.length ? (
        <p className="hint">
          Todavía no hay inventario. Aquí podrás cargar la lista de diplomados.
        </p>
      ) : (
        aliases.map((a) => (
          <form
            key={a.id}
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(e.currentTarget, a.id);
            }}
          >
            <label>
              Inventario
              <input
                name="name"
                defaultValue={a.name}
                required
                maxLength={150}
              />
            </label>
            <button disabled={busy}>Guardar nombre</button>
          </form>
        ))
      )}
    </section>
  );
}
