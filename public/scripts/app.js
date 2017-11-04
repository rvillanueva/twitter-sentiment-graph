console.log(graph);

var nodeIndex = {};

var displayed = {
  links: [],
  nodes: []
}

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
  displayed.nodes.push(source);
  displayed.nodes.push(target);
  displayed.links.push({
    source: source,
    target: target
  });
  i++;
}

function addStep(step){
  // Update existing node;
  if(displayed.nodes.length > 0){
    displayed.nodes = displayed.nodes.map(node => {
      if(node.id === step.user.id){
        node.score = step.user.score;
      }
      return node;
    })
  }

  // keep only first 10 mentions;
  step.mentioned = step.mentioned.filter((mention, m) => {
    return m < 10;
  })

  // Add mentioned nodes if they don't already exist;
  step.mentioned.map(mention => {
    var found;
    displayed.nodes.map(node => {
      if(node.id === mention.id){
        found = true;
      }
    })
    if(!found){
      displayed.nodes.push(mention);
    }
  });

  step.mentioned.map(mention => {
    displayed.links.push({
      source: getDisplayedNode(step.user.id),
      target: getDisplayedNode(mention.id)
    });
  });
  restart();
}

function getDisplayedNode(id){
  for(var i = 0; i < displayed.nodes.length; i++){
    if(displayed.nodes[i].id === id){
      return displayed.nodes[i];
    }
  }
  throw new Error('No node with id ' + id);
}



var svg = d3.select("svg"),
    width = +svg.attr("width"),
    height = +svg.attr("height"),
    color = d3.scaleOrdinal(d3.schemeCategory10);

var simulation = d3.forceSimulation(displayed.nodes)
    .force("charge", d3.forceManyBody().strength(-10))
    .force("link", d3.forceLink(displayed.links).distance(25))
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
  node = node.enter().append("circle").attr("fill", function(d) { return color(d.id); }).attr("r", 4).merge(node);
  // Apply the general update pattern to the links.
  link = link.data(displayed.links, function(d) { return d.source.id + "-" + d.target.id; });
  link.exit().remove();
  link = link.enter().append("line").merge(link);
  // Update and restart the simulation.
  simulation.nodes(displayed.nodes);
  simulation.force("link").links(displayed.links);
  simulation.alpha(1).restart();
}
function ticked() {
  node.attr("cx", function(d) { return d.x; })
      .attr("cy", function(d) { return d.y; })
  link.attr("x1", function(d) { return d.source.x; })
      .attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) { return d.target.x; })
      .attr("y2", function(d) { return d.target.y; });
}
