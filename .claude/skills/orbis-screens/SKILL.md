---
name: orbis-screens
description: Capture and send screenshots of Orbis's features to the user. Use when a feature is finished or closed (after `doctrina close`), or when the user asks to see how a feature looks.
when: A feature change closed, or the user asks for prints or screenshots of the app.
---

# Prints das features do Orbis

Mande ao usuário prints do que está pronto, sem que ele precise pedir.

## Quando usar

- Uma change de feature acabou de fechar (`doctrina close`).
- O usuário pediu para ver a tela, o estado ou os prints.

Uma change que não mexe em tela (chore, backend puro) não gera print.

## Como

1. **Acrescente a feature** em `scripts/screens/capture.mjs`, no array `screens`: o nome da feature, o nome da
   tela e os passos Playwright para chegar nela. Os passos partem sempre da Biblioteca, que é aberta antes.
2. **Gere os prints**:
   ```
   ORBIS_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium node scripts/screens/capture.mjs <pasta-de-saida>
   ```
   Use uma pasta no scratchpad, não no repositório. O script sobe um hub temporário com dados de exemplo e o
   remove no fim. Ele precisa de `npm run build` antes.
3. **Confira** cada PNG com a ferramenta de leitura de imagem antes de enviar. Se algum estiver errado (tela
   vazia, texto cortado), corrija o passo e gere de novo.
4. **Envie** com `SendUserFile` (`display: "render"`), um lote por feature, com uma legenda curta dizendo o
   que a tela mostra. Só envie as telas da feature nova, não o pacote todo.

## Limites conhecidos

- Só prints de computador (1280×800). A captura de celular precisa abrir o menu lateral antes e ainda não faz
  isso.
- Os dados são de exemplo, com dois bots de teste (Ana e Bia) e a brain de teste, que repete a mensagem.
  Por isso o resultado de uma tarefa é o próprio texto dela.
