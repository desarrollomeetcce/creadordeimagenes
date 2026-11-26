"use client";
import { useContext, useEffect, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { SheetSearchSelect } from "./sheet-search-select";
import { CurrentRole } from "./role-guide";
import { PasswordInput } from "./password-input";
import { matchesSearchWords } from "../../lib/search";
import type { performanceSettings } from "../../lib/meta-ads/advisor-performance";
type Team = Awaited<ReturnType<typeof performanceSettings>>;
type Person = Team["people"][number];
function AdvisorManagementRow({
  person,
  accounts,
  onChanged,
  onDetail,
}: {
  person: Person;
  accounts: Team["accounts"];
  onChanged: () => Promise<void>;
  onDetail: (id: string) => void;
}) {
  const accountRole = useContext(CurrentRole);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [access, setAccess] = useState(false),
    [userId, setUserId] = useState(person.portal?.userId ?? "");
  useEffect(
    () => setUserId(person.portal?.userId ?? ""),
    [person.portal?.userId],
  );
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await onChanged();
      setMessage("Guardado.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  const account = accounts.find((a) => a.id === person.portal?.userId);
  return (
    <article
      className="performance-person"
      aria-label={"Gestionar " + person.name}
    >
      <header>
        <div>
          <h3>{person.name}</h3>
          <span>{person.sheet.name}</span>
        </div>
        <button type="button" onClick={() => onDetail(person.id)}>
          Ver detalle ↗
        </button>
      </header>
      <div className="performance-person-access">
        <span>
          ✉{" "}
          {account?.email ??
            (person.portal?.userId
              ? "Cuenta vinculada"
              : "Sin cuenta de acceso")}
        </span>
        <button
          type="button"
          disabled={busy}
          aria-expanded={access}
          onClick={() => setAccess((v) => !v)}
        >
          Cuenta de acceso
        </button>
      </div>
      {access && (
        <div className="performance-access-editor">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                api("meta-ads/my-performance/link", "PUT", {
                  advisorId: person.id,
                  userId: userId || null,
                  revision: person.portal?.revision ?? 0,
                }),
              );
            }}
          >
            <h4>Vincular una cuenta existente</h4>
            {accountRole === "OWNER" && (
              <p className="hint">
                Si falta una cuenta, verifica su vínculo en{" "}
                <a href="/api/pulpo/open-crm?module=users">Usuarios y accesos de Mensajería</a>{" "}
                y vuelve a actualizar el equipo.
              </p>
            )}
            <SheetSearchSelect
              label={"Cuenta de " + person.name}
              disabled={busy}
              value={userId}
              options={[
                { value: "", label: "Sin cuenta vinculada" },
                ...accounts
                  .filter(
                    (a) =>
                      !a.advisorPortal ||
                      a.advisorPortal.advisorId === person.id,
                  )
                  .map((a) => ({
                    value: a.id,
                    label: a.name + " · " + a.email,
                  })),
              ]}
              onSelect={setUserId}
            />
            <button disabled={busy}>Guardar vínculo</button>
          </form>
          {accountRole === "OWNER" && !person.portal?.userId && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  b = new FormData(form);
                void run(async () => {
                  await api("meta-ads/my-performance/accounts", "POST", {
                    advisorId: person.id,
                    revision: person.portal?.revision ?? 0,
                    email: String(b.get("email")),
                    password: String(b.get("password")),
                  });
                  form.reset();
                });
              }}
            >
              <h4>Crear cuenta de asesor</h4>
              <label>
                Correo electrónico
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={200}
                  autoComplete="off"
                  disabled={busy}
                />
              </label>
              <label>
                Contraseña inicial · mínimo 12 caracteres
                <PasswordInput
                  name="password"
                  minLength={12}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                  disabled={busy}
                />
              </label>
              <p className="hint">
                Se crea aprobada con rol Asesor y acceso únicamente a sus
                resultados. No se envía correo automático.
              </p>
              <button disabled={busy}>Crear y vincular cuenta</button>
            </form>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="performance-person-message">
          {message}
        </p>
      )}
    </article>
  );
}
export function PerformanceTeam({
  onDetail,
  reload,
}: {
  onDetail: (id: string) => void;
  reload: number;
}) {
  const [data, setData] = useState<Team | null>(null),
    [search, setSearch] = useState(""),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState("");
  async function load() {
    const result: Team = await api("meta-ads/my-performance/settings");
    setData(result);
    setError("");
  }
  useEffect(() => {
    let active = true,
      inFlight = false;
    const refresh = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const r: Team = await api("meta-ads/my-performance/settings");
        if (active) {
          setData(r);
          setError("");
        }
      } catch (e) {
        if (active) {
          setData(null);
          setError(
            e instanceof Error ? e.message : "No se pudo cargar el equipo.",
          );
        }
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload]);
  const people =
    data?.people.filter((p) =>
      matchesSearchWords(
        p.name +
          " " +
          p.sheet.name +
          " " +
          (data.accounts.find((a) => a.id === p.portal?.userId)?.email ?? ""),
        search,
      ),
    ) ?? [];
  return (
    <section className="performance-team" aria-label="Cuentas de asesores">
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Cargando equipo…</p>}
      {data && (
        <>
          <div className="performance-team-search">
            <label>
              Buscar asesor, hoja o correo
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Escribe para encontrar…"
              />
            </label>
            <span>
              {people.length} de {data.people.length} asesores
            </span>
            <button
              type="button"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  await load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "No se pudo actualizar el equipo.");
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              {refreshing ? "Actualizando…" : "Actualizar cuentas"}
            </button>
          </div>
          {people.length ? (
            people.map((person) => (
              <AdvisorManagementRow
                key={person.id}
                person={person}
                accounts={data.accounts}
                onChanged={load}
                onDetail={onDetail}
              />
            ))
          ) : (
            <p>No hay asesores activos que coincidan.</p>
          )}
        </>
      )}
    </section>
  );
}
