// specs/web-app, specs/skills — a skill written in a form (change 0095-skills-form): name, what it does, when to
// use it and numbered steps make the SKILL.md; the text is a toggle away; a skill the form cannot hold opens as
// text; the starting example speaks the user's language.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Api } from "../src/api.js";
import { fromSkillMd, SkillsScreen, toSkillMd } from "../src/components/SkillsScreen.js";
import { useLang } from "../src/i18n.js";

afterEach(() => act(() => useLang.getState().setLang("en")));

function fakeApi(skill?: { name: string; content: string }) {
  const post = vi.fn(async (_path: string, body: { content: string }) => ({ name: fromSkillMd(body.content)?.name ?? "x", content: body.content }));
  const get = vi.fn(async (path: string) => (path.startsWith("/api/v1/skills/") ? skill : skill ? [{ name: skill.name, description: "d", scope: "account" }] : []));
  return { api: { get, post, request: vi.fn(), delete: vi.fn() } as unknown as Api, post };
}

describe("a skill as a form", () => {
  it("turns the form into SKILL.md and back, quoting what YAML would misread", () => {
    const form = { name: "resumo", description: "Resumo: a semana", when: "", steps: ["Liste.", "", "Junte."] };
    const md = toSkillMd(form);
    expect(md).toBe('---\nname: resumo\ndescription: "Resumo: a semana"\n---\n1. Liste.\n2. Junte.\n');
    expect(fromSkillMd(md)).toEqual({ ...form, steps: ["Liste.", "Junte."] });
    // Headings, prose or other keys are more than the form shows.
    expect(fromSkillMd("---\nname: a\ndescription: b\n---\n# Passos\n1. x\n")).toBeNull();
    expect(fromSkillMd("---\nname: a\ndescription: b\nlicense: MIT\n---\n1. x\n")).toBeNull();
  });

  it("writes a new skill in the form, in the user's language, and saves the SKILL.md it makes", async () => {
    act(() => useLang.getState().setLang("pt-BR"));
    const { api, post } = fakeApi();
    render(<SkillsScreen api={api} bots={[]} />);
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("resumo-semanal");
    expect(screen.getByText("Na conversa: /resumo-semanal")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Fechamento Mensal" } });
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("fechamento-mensal");
    fireEvent.change(screen.getByLabelText("O que faz"), { target: { value: "Fechar o mês" } });
    fireEvent.click(screen.getByRole("button", { name: "Tirar o passo 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar passo" }));
    fireEvent.change(screen.getByLabelText("Passo 3"), { target: { value: "Mande para mim." } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Salvar" })));
    const content = post.mock.calls[0]![1].content;
    expect(content).toMatch(/^---\nname: fechamento-mensal\ndescription: Fechar o mês\nwhen: Toda sexta, ou quando eu pedir o resumo da semana\n---\n1\. Liste/);
    expect(content).toMatch(/\n3\. Mande para mim\.\n$/);
    // The text is a toggle away, and edits there come back to the form.
    fireEvent.click(screen.getByRole("button", { name: "Editar como texto" }));
    const text = screen.getByLabelText("SKILL.md") as HTMLTextAreaElement;
    fireEvent.change(text, { target: { value: text.value.replace("Fechar o mês", "Fechar o mês com o time") } });
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao formulário" }));
    expect((screen.getByLabelText("O que faz") as HTMLInputElement).value).toBe("Fechar o mês com o time");
  });

  it("opens a skill the form cannot hold as text, and says so instead of losing it", async () => {
    const { api } = fakeApi({ name: "deploy", content: "---\nname: deploy\ndescription: Ship it\n---\n## Before\nCheck CI.\n" });
    render(<SkillsScreen api={api} bots={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: /\/deploy/ }));
    await waitFor(() => expect((screen.getByLabelText("SKILL.md") as HTMLTextAreaElement).value).toContain("## Before"));
    fireEvent.click(screen.getByRole("button", { name: "Back to the form" }));
    expect(screen.getByText(/holds more than the form shows/)).toBeTruthy();
    expect(screen.getByLabelText("SKILL.md")).toBeTruthy();
  });
});
