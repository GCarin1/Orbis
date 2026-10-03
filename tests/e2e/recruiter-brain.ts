// A brain that answers what hiring asks (specs/hiring), for the browser tests: one résumé line per candidate
// asked for, and a full profile when one is hired. It stands in for the "mock" kind on the hub it is given to.
import type { Hub } from "@orbis/hub";

type Adapter = Parameters<Hub["brains"]["register"]>[0];

const PEOPLE = [
  ["Lia", "Analista de dados", "Transforma perguntas em números e gráficos claros", ["web"]],
  ["Rui", "Pesquisador de mercado", "Mapeia concorrentes e tendências com fontes", ["web", "browser"]],
  ["Bia", "Redatora técnica", "Escreve guias e changelogs que qualquer um entende", ["computer"]],
  ["Caio", "Engenheiro de QA", "Encontra o bug antes do cliente, com casos de teste", ["computer", "browser"]],
  ["Duda", "Gerente de produto", "Prioriza o que importa e escreve histórias de usuário", []],
  ["Nina", "Designer de interface", "Desenha telas simples para celular e computador", ["browser"]],
] as const;

export function recruiterBrain(): Adapter {
  let next = 0;
  return {
    kind: "mock",
    check: () => null,
    async *run(input) {
      yield { type: "run.started" };
      let reply: string;
      if (input.task.includes("full profile")) {
        const name = /hiring (\S+),/.exec(input.task)?.[1] ?? "Lia";
        reply = JSON.stringify({
          description: `Você é ${name}: transforma perguntas do time em números, sempre dizendo o quanto tem certeza.`,
          responsibilities: ["Montar o relatório semanal de métricas", "Responder dúvidas de dados em um dia"],
          needs: ["Acesso de leitura à planilha de vendas"],
          tools: ["web"],
          skills: [
            {
              name: "relatorio-semanal",
              description: "Monta o relatório semanal de métricas.",
              steps: ["Coletar os números", "Comparar com a semana anterior", "Escrever o resumo"],
            },
          ],
          intro: `Olá! Sou ${name} e começo pelo relatório semanal.`,
        });
      } else {
        const count = Number(/Propose (\d+) candidates/.exec(input.task)?.[1] ?? 3);
        reply = Array.from({ length: count }, () => {
          const [name, role, headline, tools] = PEOPLE[next++ % PEOPLE.length]!;
          return JSON.stringify({ name, role, headline, strengths: ["SQL", "gráficos claros", "rápido"], tools });
        }).join("\n");
      }
      yield { type: "run.usage", inputTokens: 1000, outputTokens: 400, cachedTokens: 0, costUsd: 0, subscription: false };
      yield { type: "run.finished", reply };
    },
  };
}
