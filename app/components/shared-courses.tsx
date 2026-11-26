"use client";
import { useEffect, useState } from "react";

type Course = { id: string; title: string; description: string };
type Module = { id: string; title: string; brief: string; minutes: number };

export function SharedCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selected, setSelected] = useState("");
  const [modules, setModules] = useState<Module[]>([]);
  const [status, setStatus] = useState("Cargando cursos compartidos…");
  useEffect(() => {
    const controller = new AbortController();
    const path = selected ? "/" + encodeURIComponent(selected) : "";
    void fetch("/api/courses-ai/shared" + path, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error("El curso ya no está disponible.");
        return response.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (selected) setModules(data.modules);
        else setCourses(data);
        setStatus(!selected && !data.length ? "No tienes cursos compartidos." : "");
      })
      .catch((error) => { if (!controller.signal.aborted) setStatus(error.message); });
    return () => controller.abort();
  }, [selected]);
  return <section className="stack" aria-label="Cursos compartidos">
    {status && <p role="status">{status}</p>}
    {selected ? <>
      <button type="button" onClick={() => { setStatus("Cargando cursos compartidos…"); setSelected(""); }}>Volver a cursos compartidos</button>
      <h2>{courses.find((course) => course.id === selected)?.title}</h2>
      {modules.map((module) => <article className="card" key={module.id}>
        <h3>{module.title}</h3><p>{module.brief}</p><small>{module.minutes} min</small>
      </article>)}
    </> : courses.map((course) => <article className="card" key={course.id}>
      <h2>{course.title}</h2><p>{course.description}</p>
      <button type="button" onClick={() => { setModules([]); setStatus("Cargando temario…"); setSelected(course.id); }}>Ver temario</button>
    </article>)}
  </section>;
}
