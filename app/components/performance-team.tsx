"use client";
import { useEffect, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { SheetSearchSelect } from "./sheet-search-select";
import { PasswordInput } from "./password-input";
import { matchesSearchWords } from "../../lib/search";
import type { PerformanceTeam as Team } from "../../lib/meta-ads/advisor-performance";
type Person = Team["people"][number];
const number = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("es-PE", { maximumFractionDigits: 2 });
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
  const [goals, setGoals] = useState({
      BC: { percent: "", salesTarget: "" },
      BM: { percent: "", salesTarget: "" },
    }),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [access, setAccess] = useState(false),
    [userId, setUserId] = useState(person.portal?.userId ?? "");
  const revisions = [...person.targets, ...person.goals]
    .map((t) => t.basis + ":" + t.revision)
    .join("|");
  useEffect(() => {
    const value = (basis: string) => {
      const day = basis === "BC" ? person.today?.day : person.yesterday?.day;
      const t =
        person.targets.find((t) => t.basis === basis) ??
        person.goals.find(
          (g) => g.basis === basis && day && g.since <= day && g.until >= day,
        );
      return {
        percent: t?.percent == null ? "" : String(t.percent),
        salesTarget: t?.salesTarget == null ? "" : String(t.salesTarget),
      };
    };
    setGoals({ BC: value("BC"), BM: value("BM") });
  }, [revisions, person.id]);
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(() =>
            api("meta-ads/my-performance/targets", "PUT", {
              advisorId: person.id,
              targets: (["BC", "BM"] as const).map((basis) => ({
                basis,
                percent:
                  goals[basis].percent === ""
                    ? null
                    : Number(goals[basis].percent),
                salesTarget:
                  goals[basis].salesTarget === ""
                    ? null
                    : Number(goals[basis].salesTarget),
                revision:
                  person.targets.find((t) => t.basis === basis)?.revision ?? 0,
              })),
            }),
          );
        }}
      >
        <div className="performance-person-goals">
          {(["BC", "BM"] as const).map((basis) => {
            const d = basis === "BC" ? person.today : person.yesterday;
            return (
              <section
                key={basis}
                className={
                  "performance-person-goal goal-" + basis.toLowerCase()
                }
              >
                <h4>
                  {basis === "BC"
                    ? "Hoy · avance provisional"
                    : "Ayer · día completo"}
                </h4>
                <p className="performance-person-result">
                  <span>
                    Ventas{" "}
                    <b>
                      {d?.na ? "N.A." : number(d?.sales)}
                      {d?.partial ? " *" : ""}
                    </b>
                  </span>
                  <span>
                    {basis} <b>{number(d?.base)}</b>
                  </span>
                  <span>
                    Efectividad{" "}
                    <b>{d?.percent == null ? "—" : number(d.percent) + " %"}</b>
                  </span>
                </p>
                <div className="performance-target-inputs">
                  <label>
                    Meta de efectividad (%)
                    <input
                      aria-label={"Meta " + basis + " de " + person.name}
                      disabled={busy}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="Sin definir"
                      value={goals[basis].percent}
                      onChange={(e) =>
                        setGoals((v) => ({
                          ...v,
                          [basis]: { ...v[basis], percent: e.target.value },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Ventas por día · opcional
                    <input
                      aria-label={
                        "Meta de ventas " + basis + " de " + person.name
                      }
                      disabled={busy}
                      type="number"
                      min="1"
                      max="100000000"
                      step="1"
                      placeholder="Sin meta"
                      value={goals[basis].salesTarget}
                      onChange={(e) =>
                        setGoals((v) => ({
                          ...v,
                          [basis]: { ...v[basis], salesTarget: e.target.value },
                        }))
                      }
                    />
                  </label>
                </div>
              </section>
            );
          })}
        </div>
        <footer>
          <span>
            Metas diarias independientes. Un campo vacío deja esa meta sin
            definir.
          </span>
          <button className="primary" disabled={busy}>
            Guardar metas
          </button>
        </footer>
      </form>
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
          {!person.portal?.userId && (
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
    [error, setError] = useState("");
  async function load() {
    const result: Team = await api("meta-ads/my-performance/team");
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
        const r: Team = await api("meta-ads/my-performance/team");
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
  const sales =
    data?.people
      .map((p) => p.yesterday?.sales)
      .filter((n): n is number => n != null) ?? [];
  return (
    <section className="performance-team" aria-label="Mis asesores">
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Cargando equipo…</p>}
      {data && (
        <>
          <div className="performance-team-summary">
            <div>
              <span>Asesores activos</span>
              <strong>{data.people.length}</strong>
            </div>
            <div>
              <span>Con acceso</span>
              <strong>
                {data.people.filter((p) => p.portal?.userId).length}
              </strong>
            </div>
            <div>
              <span>Con ambas metas</span>
              <strong>
                {
                  data.people.filter((p) =>
                    (["BC", "BM"] as const).every((basis) => {
                      const target = p.targets.find((t) => t.basis === basis);
                      const day =
                        basis === "BC" ? p.today?.day : p.yesterday?.day;
                      return target
                        ? target.percent !== null
                        : p.goals.some(
                            (g) =>
                              g.basis === basis &&
                              day &&
                              g.since <= day &&
                              g.until >= day,
                          );
                    }),
                  ).length
                }
              </strong>
            </div>
            <div>
              <span>Ventas de ayer · {data.yesterday}</span>
              <strong>
                {sales.length ? number(sales.reduce((a, b) => a + b, 0)) : "—"}
                {sales.length < data.people.length ||
                data.people.some((p) => p.yesterday?.partial)
                  ? " *"
                  : ""}
              </strong>
              <small>* si faltan registros o hay cobertura parcial</small>
            </div>
          </div>
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
          </div>
          <p className="hint">
            Hoy se mide con ventas/BC; ayer con ventas/BM de las 24 horas
            completas en Lima. Las metas se aplican cada día hasta que las
            cambies.
          </p>
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
