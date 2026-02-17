type InfoCardProps = {
  title: string;
  body: string;
};

export function InfoCard({ title, body }: InfoCardProps) {
  // Keeps feature cards uniform while the product copy evolves.
  return (
    <article className="info-card shell-card">
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}
