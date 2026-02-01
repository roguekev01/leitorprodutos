# Como transformar este sistema em APK (App Android)

Como seu projeto é feito com tecnologias Web (HTML, CSS, JS), existem duas formas principais de colocar ele no celular.

## Opção 1: Gerar um arquivo .APK (Mais Comum)

A forma mais fácil no Windows é usar um programa que "empacota" seus arquivos dentro de um aplicativo Android.

1.  **Baixe o "Website 2 APK Builder"** (ou similar, como *Web2Apk*).
2.  Instale e abra o programa.
3.  **Configurações Importantes**:
    *   **App Title**: Leitor Super Líder
    *   **Package Name**: com.superlider.leitor
    *   **Orientation**: Portrait (Retrato)
    *   **Output Directory**: Escolha onde salvar o APK.
4.  **Mode / Tipo**:
    *   Escolha **"Local HTML Website"** (Site Local).
    *   Clique em **Choose Folder** e selecione a pasta `System` (essa pasta onde estão os arquivos `index.html`, `script.js`, etc).
5.  **Ícone**:
    *   Selecione o arquivo `logo.jpg` ou crie um ícone quadrado (512x512) para ficar bonito no menu do celular.
6.  **Gerar**:
    *   Clique em **BUILD APK**.
    *   O programa vai criar o arquivo. Basta enviar para seu celular via WhatsApp ou USB e instalar!

---

## Opção 2: PWA ( aplicativo Web Progressivo)

Se você hospedar esse site na internet (ex: Vercel, Netlify ou GitHub Pages), você não precisa de APK.

1.  Acesse o site pelo Chrome do celular.
2.  Clique nos 3 pontinhos.
3.  Selecione **"Adicionar à Tela Inicial"** ou **"Instalar Aplicativo"**.
4.  O ícone vai aparecer no menu do celular igual a um app nativo.

*Já preparei o arquivo `manifest.json` na pasta para facilitar qualquer um dos dois métodos!*
