console.log(graph);

var nodeIndex = {};
var master = {
  links: [],
  nodes: []
};
var displayed = {
  links: [],
  nodes: []
}
var messages = [];

var i = 0;

addSeedNode();
addNewNodes();

function addNewNodes(){
  setTimeout(() => {
    if(i < graph.steps.length){
      console.log(displayed)
      addStep(graph.steps[i]);
      i++;
      addNewNodes();
    }
  }, 1000);
}

function addSeedNode(){
  var source = graph.steps[0].user;
  var target = graph.steps[0].mentioned[0];
  master.nodes.push(source);
  master.nodes.push(target);
  master.links.push({
    source: source,
    target: target
  });
  displayed.nodes.push(source);
  messages.push({
    screen_name: source.id,
    profile_image_url: source.profile_image_url
  })
  i++;
}

function addStep(step){
  // Update existing node;
  master.nodes = master.nodes.map(node => {
    if(node.id === step.user.id){
      node.score = step.user.score;
    }
    return node;
  })
  step.mentioned.map(mention => {
    var found;
    if(!getMasterNode(mention.id)){
      master.nodes.push(mention)
    }
  });

  step.mentioned.map(mention => {
    master.links.push({
      source: getMasterNode(step.user.id),
      target: getMasterNode(mention.id)
    })
  })

  var newNode = getMasterNode(step.user.id)
  displayed.nodes.push(newNode);
  master.links.map(link => {
    if(link.target === newNode){
      displayed.links.push(link);
    }
  })
  messages.push({
    screen_name: step.user.id,
    text: step.user.bestTweet.text,
    profile_image_url: step.user.profile_image_url
  })
  restart();
}

function getMasterNode(id){
  for(var i = 0; i < master.nodes.length; i++){
    if(master.nodes[i].id === id){
      return master.nodes[i];
    }
  }
  return null;
}



var svg = d3.select("svg"),
    width = +svg.attr("width"),
    height = +svg.attr("height"),
    color = d3.scaleOrdinal(d3.schemeCategory10);

var simulation = d3.forceSimulation(displayed.nodes)
    .force("charge", d3.forceManyBody().strength(-40))
    .force("link", d3.forceLink(displayed.links).distance(50))
    .force("x", d3.forceX())
    .force("y", d3.forceY())
    .alphaTarget(1)
    .on("tick", ticked);
var g = svg.append("g").attr("transform", "translate(" + width / 2 + "," + height / 2 + ")"),
    link = g.append("g").attr("stroke", "#000").attr("stroke-width", 1).selectAll(".link"),
    node = g.append("g").attr("stroke", "#fff").attr("stroke-width", 1).selectAll(".node");
restart();

function restart() {
  // Apply the general update pattern to the nodes.
  node = node.data(displayed.nodes, function(d) { return d.id;});
  node.exit().remove();
  node = node.enter()
    .append("circle").attr("fill", function(d) { return getColor(d);}).attr("r", function(d) { return getRadius(d);}).merge(node);

  // Apply the general update pattern to the links.
  link = link.data(displayed.links, function(d) { return d.source.id + "-" + d.target.id; });
  link.exit().remove();
  link = link.enter().append("line").merge(link);
  // Update and restart the simulation.
  simulation.nodes(displayed.nodes);
  simulation.force("link").links(displayed.links);
  simulation.alpha(1).restart();
  renderTweetBox();
}
function ticked() {
  node.attr("cx", function(d) { return d.x; })
      .attr("cy", function(d) { return d.y; })
  link.attr("x1", function(d) { return d.source.x; })
      .attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) { return d.target.x; })
      .attr("y2", function(d) { return d.target.y; });
}

function getColor(node){
  if(typeof node.score === 'number'){
    var normalizedScore = (node.score + 5)/10;
    var hue = Math.floor(normalizedScore * (356 - 230)) + 230;
    return `hsl(${hue}, 75%, 50%)`;
  }
  return 'rgb(189, 189, 189)';
}

function getRadius(node){
  if(typeof node.score === 'number'){
    return 8;
  }
  return 2;
}

function getLinkStroke(node){
  return Math.floor(node.score + 5 + 1);
}

function renderTweetBox(){
  var container = document.getElementById('tweet-box');
  container.innerHTML = '';
  messages.map(message => {
    var div = document.createElement('div');
    div.className = 'tweet-container';
    div.innerHTML = `
      <strong>${message.screen_name}</strong>
    `
    if(message.text){
      div.innerHTML += `
      <p class='tweet-text'>${message.text}</p>
      `
    }
    container.insertBefore(div, container.firstChild);
  })
}
