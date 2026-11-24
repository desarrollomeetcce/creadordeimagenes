import Image from "next/image";

export function PulpoBrand({ messaging = false }: { messaging?: boolean }) {
  return (
    <>
      <Image
        className="pulpo-product-mascot"
        src={messaging ? "/pulpo-mensajeria.webp" : "/pulpo-generador.webp"}
        alt=""
        width={36}
        height={36}
      />
      <span className="pulpo-product-name">
        <small>Pulpo</small>
        {messaging ? "Mensajería" : "Generador"}
      </span>
    </>
  );
}
