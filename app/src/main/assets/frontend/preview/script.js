const nameNode = document.querySelector("#name");
const outputNode = document.querySelector("#output");
const readButton = document.querySelector("#read");

async function readNativeContext() {
  readButton.disabled = true;
  outputNode.textContent = "正在读取原生上下文...";
  try {
    const [context, variableState, capabilities] = await Promise.all([
      window.ElecKoi.context.current(),
      window.ElecKoi.variables.getState(),
      window.ElecKoi.app.getCapabilities(),
    ]);
    nameNode.textContent = context.characterName || "未命名角色";
    outputNode.textContent = JSON.stringify({ context, variableState, capabilities }, null, 2);
  } catch (error) {
    outputNode.textContent = `${error.code || "API_ERROR"}: ${error.message}`;
  } finally {
    readButton.disabled = false;
  }
}

readButton.addEventListener("click", readNativeContext);
readNativeContext();
