export default function Html({
  stylesheets = [],
  scripts = [],
  children,
  title,
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="shortcut icon" href="favicon.ico" />
        {stylesheets.map((stylesheet) => (
          <link key={stylesheet} rel="stylesheet" href={stylesheet} />
        ))}
        <title>{title}</title>
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `stylesheets = ${JSON.stringify(stylesheets)};
scripts = ${JSON.stringify(scripts)};`,
          }}
        />
        {scripts.map((script) => (
          <script key={script} src={script} />
        ))}
      </body>
    </html>
  );
}
