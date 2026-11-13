# Plugins do Qyrex

Plugins acrescentam **links rápidos**, **modelos de projeto** e o **painel de notas** ao Qyrex. Eles são **declarativos**: um plugin é só um arquivo `qyrex-plugin.json`. Nenhum código de terceiro roda dentro do app. O Qyrex lê o manifesto, valida cada campo e usa os dados com as próprias funções.

Por isso um plugin **não consegue**:

- rodar comandos, scripts ou JavaScript;
- acessar Node.js, Electron, IPC, credenciais ou o cofre de segredos;
- ler ou escrever arquivos fora do que você aprovar na hora (só os modelos de projeto criam pastas e arquivos de texto, e só depois da sua confirmação, dentro de uma pasta autorizada e nova).

## Estrutura

```
meu-plugin/
  qyrex-plugin.json
```

## Manifesto

```json
{
  "id": "autor.links-do-time",
  "name": "Links do time",
  "version": "1.0.0",
  "author": "Seu nome",
  "description": "Atalhos para a documentação do time.",
  "homepage": "https://github.com/autor/links-do-time",
  "qyrex": "2.2.0",
  "permissions": ["quickLinks"],
  "contributes": {
    "quickLinks": [{ "title": "Guia de estilo", "url": "https://example.com/guia" }]
  }
}
```

| Campo | Obrigatório | Regra |
| --- | --- | --- |
| `id` | sim | minúsculas, com ponto ou hífen: `autor.nome`. Os ids `qyrex.*` são dos plugins oficiais. |
| `name` | sim | até 60 caracteres |
| `version` | sim | `MAJOR.MINOR.PATCH` (ex.: `1.0.0`) |
| `author` | sim | até 80 caracteres |
| `description` | não | até 400 caracteres |
| `homepage` | não | URL |
| `qyrex` | não | versão mínima do app (padrão `2.2.0`). Se o app for mais antigo, o plugin é recusado. |
| `permissions` | não | lista entre `quickLinks`, `projectTemplates` e `notes` |
| `contributes` | não | o que o plugin acrescenta (veja abaixo) |

Qualquer campo desconhecido (por exemplo `main`, `scripts` ou `contributes.commands`) faz o manifesto ser **recusado**.

## Permissões e contribuições

Toda contribuição precisa da permissão correspondente declarada em `permissions`. Na página Plugins, cada permissão aparece explicada para o usuário antes de ele ligar o plugin.

### `quickLinks`

```json
"contributes": {
  "quickLinks": [{ "title": "Painel de deploy", "url": "https://vercel.com/dashboard" }]
}
```

Até 30 links, só `http` e `https`. Eles aparecem na paleta de comandos (Ctrl+K), no grupo **Links**, e abrem no navegador padrão.

### `projectTemplates`

```json
"contributes": {
  "projectTemplates": [
    {
      "id": "api-fastify",
      "name": "API Fastify",
      "description": "API com rotas e testes.",
      "technologies": ["Node.js", "Fastify"],
      "folders": ["src/routes", "tests"],
      "files": [
        { "path": "README.md", "content": "# {name}\n\nAPI criada pelo modelo.\n" },
        { "path": ".env.example", "content": "PORT=3000\n" }
      ],
      "tasks": ["Definir as rotas", "Configurar o CI"]
    }
  ]
}
```

- `folders` e `files[].path` são **relativos**: não podem ser absolutos nem conter `..`. Também não podem usar caracteres inválidos no Windows.
- `files[].content` é texto, até 20 mil caracteres por arquivo. `{name}` vira o nome do projeto.
- Ao usar o modelo, o Qyrex mostra a lista do que vai criar e pede confirmação. A pasta de destino precisa estar dentro de uma pasta autorizada e **não pode existir**, então nada é sobrescrito.

### `notes`

Liga o painel **Notas** do Workspace. Hoje só o plugin oficial "Notas do projeto" usa essa permissão.

## Instalar, atualizar e remover

1. Abra **Plugins** na barra lateral.
2. Clique em **Instalar pacote local** e escolha a pasta do plugin (ou o próprio `qyrex-plugin.json`).
3. Para **atualizar**, instale de novo com uma `version` igual ou maior. Uma versão menor é recusada.
4. **Remover** apaga o plugin (os embutidos podem ser desligados, não removidos). Seus projetos e notas continuam.

Um exemplo completo está em [`docs/plugin-example/qyrex-plugin.json`](plugin-example/qyrex-plugin.json).
