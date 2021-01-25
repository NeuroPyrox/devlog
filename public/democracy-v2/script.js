const textarea = document.getElementsByTagName("textarea")[0];
const resizeTextarea = _ => {
  textarea.style.height = "0";
  textarea.style.height = textarea.scrollHeight + "px";
};
const clearTextarea = _ => {
  textarea.value = "";
  resizeTextarea();
};
resizeTextarea();

const proposeButton = document.getElementsByTagName("button")[0];
const renderProposeButton = _ => {
  proposeButton.className =
    textarea.value.length === 0 ? "proposeCant" : "propose";
};
const deactivateProposeButton = _ => {
  proposeButton.className = "proposeCant";
};
renderProposeButton();

const rules = document.getElementById("rules");
const addRule = rule => {
  const ruleNode = document.createElement("div");
  ruleNode.className = "rule";

  const xButton = document.createElement("button");
  xButton.className = "xRule";
  ruleNode.appendChild(xButton);
  xButton.onclick = _ => ruleNode.remove();

  ruleNode.appendChild(document.createTextNode(rule));

  rules.appendChild(ruleNode);
};

const proposalsNode = document.getElementById("proposals");
const addProposal = proposal => {
  const proposalNode = document.createElement("div");
  proposalNode.className = "proposal";

  const textNode = document.createElement("p");
  textNode.appendChild(document.createTextNode(proposal));
  proposalNode.appendChild(textNode);

  const checkButton = document.createElement("button");
  checkButton.className = "check";
  proposalNode.appendChild(checkButton);
  checkButton.onclick = _ => {
    // nodeValue === proposal, but we use nodeValue to save memory
    addRule(textNode.firstChild.nodeValue);
    proposalNode.remove();
  };

  const xButton = document.createElement("button");
  xButton.className = "xProposal";
  proposalNode.appendChild(xButton);
  xButton.onclick = _ => proposalNode.remove();

  proposalsNode.appendChild(proposalNode);
};

textarea.oninput = _ => {
  resizeTextarea();
  renderProposeButton();
};

proposeButton.onclick = _ => {
  if (textarea.value.length !== 0) {
    addProposal(textarea.value);
    clearTextarea();
    deactivateProposeButton();
  }
};
