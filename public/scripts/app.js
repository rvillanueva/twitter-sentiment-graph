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
var startTime = 2000;
var endTime = 200;

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
  }, (startTime - endTime) * (graph.steps.length - i) / graph.steps.length + endTime);
}

function addSeedNode(){
  var source = graph.steps[0].user;
  var target = graph.steps[0].mentioned[0];
  master.nodes.push(source);
  master.nodes.push(target);
  master.links.push({
    source: source,
    target: target,
    score: graph.steps[0].mentioned[0].score
  });
  displayed.nodes.push(source);
  messages.push({
    user: {
      screen_name: source.id,
      profile_image_url: source.profile_image_url
    }
  })
  i++;
}

function addStep(step){
  // Update existing node;
  master.nodes = master.nodes.map(node => {
    if(node.id === step.user.id){
      node.score = step.user.score;
      node.profile_image_url = step.user.profile_image_url;
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
      target: getMasterNode(mention.id),
      score: mention.score
    })
  })

  var newNode = getMasterNode(step.user.id)
  displayed.nodes.push(newNode);
  master.links.map(link => {
    if(link.target === newNode){
      console.log(link)
      displayed.links.push(link);
    }
  })
  messages.push({
    user: {
      screen_name: step.user.id,
      profile_image_url: step.user.profile_image_url
    },
    text: step.user.bestTweet.text,
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
    .force("charge", d3.forceManyBody().strength(-500))
    .force("link", d3.forceLink(displayed.links).distance(90))
    .force("x", d3.forceX())
    .force("y", d3.forceY())
    .alphaTarget(1)
    .on("tick", ticked);
var g = svg.append("g").attr("transform", "translate(" + width / 2 + "," + height / 2 + ")"),
    link = g.append("g").attr("stroke", "#000").attr("stroke-width", 1).selectAll(".link"),
    node = g.append("g").selectAll(".node");
restart();

function restart() {
  displayed.nodes = displayed.nodes.map(node => {
    node.radius = getRadiusScale(node);
    return node;
  })
  // Apply the general update pattern to the nodes.
  node = node.data(displayed.nodes, function(d) { return d.id;});
  node.exit().remove();
  var nodeEnter = node.enter();
  var holder = nodeEnter
    .append('svg:g')
    .attr("class", "node")


  holder.append("clipPath")       // define a clip path
    .attr("id", "ellipse-clip") // give the clipPath an ID
    .append("ellipse")          // shape it as an ellipse
      .attr("cx", 0)         // position the x-centre
      .attr("cy", 0)         // position the y-centre
      .attr("rx", 24)         // set the x radius
      .attr("ry", 24);         // set the y radius
  holder // give the clipPath an ID
    .append("ellipse")          // shape it as an ellipse
      .attr("cx", 0)         // position the x-centre
      .attr("cy", 0)         // position the y-centre
      .attr("rx", 24)         // set the x radius
      .attr("ry", 24)
      .attr("stroke", function(d) {return getColor(d)})
      .attr("stroke-width", 4)
      .attr("opacity", function(d){ return getOpacity(d, 0, 1)})
  holder.append("svg:image")
        .attr("clip-path", "url(#ellipse-clip)") // clip the rectangle
        .attr("xlink:href",  function(d) { return d.profile_image_url;})
        .attr("height", 48)
        .attr("width", 48)
        .attr("x", -24)
        .attr("y", -24)
  holder // give the clipPath an ID
    .append("ellipse")          // shape it as an ellipse
      .attr("cx", 0)         // position the x-centre
      .attr("cy", 0)         // position the y-centre
      .attr("rx", 24)         // set the x radius
      .attr("ry", 24)
      .attr("fill", function(d){ return getColor(d)})
      .attr("opacity", function(d){ return getOpacity(d, 0, 0.5)})


  node = holder.merge(node);

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
  node.attr("transform", function(d) { return `translate(${d.x},${d.y}) scale(${d.radius})`; })
      //.attr("x", function(d) { return d.x - 20; })
      //.attr("y", function(d) { return d.y - 20; })
  link.attr("x1", function(d) { return d.source.x; })
      .attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) { return d.target.x; })
      .attr("y2", function(d) { return d.target.y; });
}

function getColor(node){
  if(typeof node.score === 'number'){
    var normalizedScore = normalizeScore(node.score);
    var hue;
    if(node.score > 0){
      hue = 240
    } else {
      hue = 0;
    }
    var color = `hsl(${hue}, 75%, 35%)`;
    return color;
  }
  return 'rgb(189, 189, 189)';
}

function getOpacity(node, min, max){
  if(typeof node.score === 'number'){
    var normalizedScore = (normalizeScore(node.score) - 0.5) * 2;
    return Math.abs(normalizedScore) * (max - min) + min;
  }
  return 0;
}

function getLinkStroke(node){
  return Math.floor(node.score + 5 + 1);
}

function getRadiusScale(node){
  var minScale = 0.8;
  var mentionScoreTotal = 0;
  var mentionCount = 0;
  var mentionScore = 0;
  displayed.links.map(link => {
    if((link.source.id === node.id || link.target.id === node.id) && typeof link.score === 'number'){
      mentionScoreTotal += link.score;
      mentionCount ++;
    }
  })
  if(mentionCount > 1){
    mentionScore = mentionScoreTotal/mentionCount;
  }
  var scale = minScale + Math.min(normalizeMentionScore(mentionScore) * 2, 2);
  return scale;
}

function normalizeScore(score){
  var normalized = score / graph.maxScore;
  return Math.max(Math.min(normalized, 1), 0);
}

function normalizeMentionScore(score){
  var normalized = score / graph.maxEdgesScore;
  return Math.max(Math.min(normalized, 1), 0);
}

function renderTweetBox(){
  var container = document.getElementById('tweet-box');
  container.innerHTML = '';
  messages.map(message => {
    var div = document.createElement('div');
    div.className = 'tweet-container';
    div.innerHTML = `
      <strong>${message.user.screen_name}</strong>
    `
    if(message.text){
      div.innerHTML += `
      <p class='tweet-text'>${message.text}</p>
      `
    }
    container.insertBefore(div, container.firstChild);
  })
}
