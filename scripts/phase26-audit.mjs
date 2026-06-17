import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const failures = [];
const passes = [];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function walk(path, extensions = null) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return [];

  return readdirSync(absolute).flatMap((name) => {
    const child = join(absolute, name);
    const relativeChild = relative(root, child).replaceAll("\\", "/");
    if (["node_modules", "dist", ".turbo"].includes(name)) return [];
    if (statSync(child).isDirectory()) return walk(relativeChild, extensions);
    if (extensions && !extensions.some((extension) => name.endsWith(extension))) return [];
    return [relativeChild];
  });
}

function check(condition, message) {
  if (condition) passes.push(message);
  else failures.push(message);
}

function quotedValues(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function duplicates(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function auditRoutes(name, routeFile, aliasName) {
  const source = read(routeFile);
  const routesBlock = source.match(new RegExp(`export const ${name}Routes[\\s\\S]*?\\n\\];`))?.[0] ?? "";
  const aliasesBlock = source.match(new RegExp(`export const ${aliasName}[\\s\\S]*?\\n\\];`))?.[0] ?? "";
  const routes = quotedValues(routesBlock, /path:\s*"([^"]+)"/g);
  const aliases = [...aliasesBlock.matchAll(/from:\s*"([^"]+)"\s*,\s*to:\s*"([^"]+)"/g)]
    .map((match) => ({ from: match[1], to: match[2] }));
  const allowedExternalTargets = new Set(["/login"]);
  const targets = new Set(routes);

  check(routes.length > 0, `${name}: declaração canônica possui rotas`);
  check(duplicates(routes).length === 0, `${name}: rotas canônicas sem duplicidade`);
  check(duplicates(aliases.map(({ from }) => from)).length === 0, `${name}: aliases sem origem duplicada`);
  check(
    aliases.every(({ from, to }) => !targets.has(from) && (targets.has(to) || allowedExternalTargets.has(to))),
    `${name}: aliases não sombreiam rota e apontam para destino canônico`,
  );
}

auditRoutes("professional", "apps/professional/src/routes.ts", "professionalAliases");
auditRoutes("admin", "apps/admin/src/routes.ts", "adminAliases");

const clientRoutes = quotedValues(read("apps/client/src/routes.ts"), /path:\s*"([^"]+)"/g);
check(clientRoutes.length > 0, "client: declaração canônica possui rotas");
check(duplicates(clientRoutes).length === 0, "client: rotas canônicas sem duplicidade");

for (const app of ["professional", "admin", "client"]) {
  const appFiles = walk(`apps/${app}/src`, [".ts", ".tsx"]);
  const orphanPages = walk(`apps/${app}/src/pages`, [".tsx"]).filter((pagePath) => {
    const pageName = pagePath.split("/").at(-1)?.replace(/\.tsx$/, "");
    return pageName && !appFiles.some((candidate) => candidate !== pagePath && read(candidate).includes(pageName));
  });
  check(orphanPages.length === 0, `${app}: sem páginas órfãs`);
}

const publicHandlers = [
  "public-booking-handler",
  "client-portal-handler",
  "anamnese-public-handler",
  "public-appointment-actions",
  "public-package-handler",
  "public-quote-handler",
  "public-chat-handler",
];
const supabaseConfig = read("supabase/config.toml");
for (const handler of publicHandlers) {
  const source = read(`supabase/functions/${handler}/index.ts`);
  check(source.includes("assertPublicRateLimit"), `${handler}: aplica rate limit canônico`);
  check(
    new RegExp(`\\[functions\\.${handler}\\][\\s\\S]*?verify_jwt\\s*=\\s*false`).test(supabaseConfig),
    `${handler}: exposição pública explícita em config.toml`,
  );
}

const clientSource = walk("apps/client/src", [".ts", ".tsx"]).map(read).join("\n");
check(!clientSource.includes("supabase.from("), "client: sem acesso direto amplo a tabelas");
check(!clientSource.includes("/agendar/demo"), "client: sem fallback para tenant demo");
const portalState = read("apps/client/src/lib/client-portal-state.ts");
check(!portalState.includes("localStorage"), "portal: sessão não usa localStorage");
check(portalState.includes("sessionStorage"), "portal: sessão usa sessionStorage");

const functionDirectories = readdirSync(join(root, "supabase/functions"))
  .filter((name) => name !== "_shared" && statSync(join(root, "supabase/functions", name)).isDirectory());
const incompleteFunctions = functionDirectories.filter((name) => !existsSync(join(root, "supabase/functions", name, "index.ts")));
check(incompleteFunctions.length === 0, "Edge Functions locais sem diretórios incompletos");
check(duplicates(functionDirectories).length === 0, "Edge Functions locais sem owner duplicado por slug");

const functionSources = walk("supabase/functions", [".ts"]).map((path) => ({ path, source: read(path) }));
const internalPhaseMarkers = functionSources.filter(({ source }) => /Phase\s+\d+|Fase\s+\d+/i.test(source));
check(internalPhaseMarkers.length === 0, "Edge Functions sem comentários internos de fase");

const forbiddenIdentity = walk("apps/professional/src", [".ts", ".tsx"])
  .flatMap((path) => {
    const source = read(path);
    return /professional_id\s*:\s*(body|payload|input)\./.test(source) ? [path] : [];
  });
check(forbiddenIdentity.length === 0, "professional: professional_id não vem diretamente de payload");

const professionalViteConfig = read("apps/professional/vite.config.ts");
check(
  !professionalViteConfig.includes("supabase-cache") && !professionalViteConfig.includes("runtimeCaching"),
  "professional PWA: respostas autenticadas do Supabase não são armazenadas pelo service worker",
);

const inviteTeamMember = read("supabase/functions/invite-team-member/index.ts");
check(inviteTeamMember.includes("InviteTeamMemberInputSchema.safeParse"), "invite-team-member: entrada validada por contrato");
check(!inviteTeamMember.includes("error.message"), "invite-team-member: resposta não expõe mensagem interna");

console.log(`Phase 26 audit: ${passes.length} checks passed.`);
for (const message of passes) console.log(`PASS ${message}`);

if (failures.length > 0) {
  console.error(`\nPhase 26 audit: ${failures.length} check(s) failed.`);
  for (const message of failures) console.error(`FAIL ${message}`);
  process.exitCode = 1;
}
