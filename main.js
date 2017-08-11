    const NORMAL = 1, TO_BE_REMOVED = 2, INFECTED = 3;
    const LOADING = 'Loading', WAITING = 'Wating', ATTACK = 'Attack', CONTAGION = 'Contagion';
    const PERCENTAGE = 0;
    var svg = d3.select("svg"),
        width = +svg.attr("width"),
        height = +svg.attr("height");

    var color = v => {
        switch (v) {
            case NORMAL: return 'blue';
            case TO_BE_REMOVED: return 'red';
            case INFECTED: return '#ee7600';
        }
    };

    var linkColor = v => {
        switch (v) {
            case NORMAL: return '#aaa';
            case TO_BE_REMOVED: return 'red';
        }
    };
    const nodeSize = 9, transitionDuration = 500;

    let graph, rawData, rawDataTmp, stats, timer,
        iteration, status, totalMaxDegree, options,
        cachedGiantComponentSize, giantComponentSizes, averageDegrees;

    var simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(function (d) { return d.id; }))
        .force("charge", d3.forceManyBody())
        .force("center", d3.forceCenter(width / 2 - 120, height / 2))
        .velocityDecay(0.5)
        .on("tick", ticked);

    let link = svg.append("g").classed('links', true).attr("stroke-width", 0.3).selectAll(".link");
    let node = svg.append("g").classed('nodes', true).attr("stroke-width", 1).selectAll(".node");

    loadEvents();
    d3.json("adjacency_matrix.json", function (error, data) {
        if (error) throw error;
        rawData = data;
        reset();
    });

    function reset() {
        rawDataTmp = JSON.parse(JSON.stringify(rawData));
        graph = getGraph(rawData);
        giantComponentSizes = [];
        averageDegrees = []
        iteration = 0;
        totalMaxDegree = d3.max(graph.nodes, n => n.degree);
        stopTimer();
        options = getOptions();
        status = LOADING;
        simulation.restart();
        draw();
        d3.timeout(() => {
            simulation.stop();
            status = WAITING;
            draw();
        }, 4000);
    }

    function getAllControls() {
        return [...document.querySelectorAll('input, select, button')];
    }

    function getControlsToDisable(status) {
        let componentsToDisableSelector;
        const statusDisablingSelectorMatrix = {
            [LOADING]: 'button',
            [WAITING]: '#stop',
            [ATTACK]: 'input, select, button:not(#stop)',
            [CONTAGION]: 'input, select, button:not(#stop)'
        }
        const selector = statusDisablingSelectorMatrix[status];
        if (!selector)
            return [];
        return [...document.querySelectorAll(selector)];
    }

    function draw() {
        stats = getStats();
        const controls = getAllControls();
        controls.forEach(c => c.disabled = false);
        const controlsToDisable = getControlsToDisable(status);
        controlsToDisable.forEach(c => c.disabled = true);

        d3.select('.status').text(d => 'Status: ' + status);

        d3.select('.iter').text(d => 'Iteration: ' + iteration)

        node = svg.select('.nodes')
            .selectAll("rect")
            .data(graph.nodes, function (d) { return d.id; });
        node.exit().remove();
        node = node.enter().append("rect").merge(node);
        node
            .on('mouseover', d => {
                setNodeToDelete(d);
                draw();
            })
            .on('mouseout', d => {
                setNodeNotToDelete(d);
                draw();
            })
            .on("click", d => {
                removeVertex(d);
                draw();
            })
            .transition()
            .duration(transitionDuration)
            .attr("width", d => d.group == 3 ? nodeSize - 1 : nodeSize)
            .attr("height", d => d.group == 3 ? nodeSize - 1 : nodeSize)
            .attr("rx", d => d.group == 3 ? 0 : 100)
            .attr("ry", d => d.group == 3 ? 0 : 100)
            .attr('transform', `translate(-${nodeSize / 2}, -${nodeSize / 2})`)
            .attr("fill", d => color(d.group));

        link = link
            .data(graph.links, function (d) { return d.source.id + "-" + d.target.id; });
        link.exit().remove();
        link = link.enter().append("line").merge(link);
        link
            .transition()
            .duration(transitionDuration)
            .attr("stroke", d => linkColor(d.group))
            .attr("stroke-width", d => d.group == 2 ? 1 : 0.5);

        node.append("title")
            .text(function (d) { return d.id; });

        simulation
            .nodes(graph.nodes);

        simulation.force("link")
            .links(graph.links);

        simulation.alpha(1);

        const statsVis = d3.select('#stats')
            .selectAll('div')
            .data(stats);

        statsVis.exit().remove();
        statsVis.enter().append('div');
        d3.select('#stats')
            .selectAll('div')
            .text(d => d.label + ': ' + d.val);

        drawPdfChart(graph.nodes.map(n => n.degree), totalMaxDegree, '#degreechart');
        drawPdfChart(graph.nodes.map(n => n.clusteringCoefficient * 100), 100, '#clusteringcoefficientchart');
        drawLineChart([giantComponentSizes.map((s, i) => [i, s])], giantComponentSizes.length + 10, giantComponentSizes[0] * 1.1 || graph.nodes.length, '#giantcomponentchart');

        drawLineChart([averageDegrees.map((s, i) => [i, s])], averageDegrees.length + 10, averageDegrees[0] * 1.3 || 12, '#averagedegreeschart')

        function drawPdfChart(values, xMaxVal, selector) {
            //performance-wise it makes sense
            if (status == CONTAGION || (options.speed == 750 && iteration % 5))
                return;

            var x = d3.scaleLinear()
                .domain([0, xMaxVal]);

            var n = values.length,
                bins = d3.histogram().domain(x.domain())(values),
                density = kernelDensityEstimator(kernelEpanechnikov(7), x.ticks(20))(values);

            drawLineChart([density], xMaxVal, .1, selector, x, { yAxis: PERCENTAGE });

            function kernelDensityEstimator(kernel, X) {
                return function (V) {
                    return X.map(x => [x, d3.mean(V, v => kernel(x - v))]);
                };
            }

            function kernelEpanechnikov(k) {
                return function (v) {
                    v = v / k;
                    return Math.abs(v) <= 1 ? 0.75 * (1 - v * v) / k : 0;
                };
            }
        }

        function drawLineChart(data, xMaxVal, yMaxVal, selector, xScale, options = {}) {
            var chart = d3.select(selector),
                chartWidth = +chart.attr("width"),
                chartHeight = +chart.attr("height"),
                margin = { top: 10, right: 30, bottom: 30, left: 40 };

            let x;
            if (xScale)
                x = xScale
                    .range([margin.left, chartWidth - margin.right]);
            else
                x = d3.scaleLinear()
                    .domain([0, xMaxVal])
                    .range([margin.left, chartWidth - margin.right]);

            var y = d3.scaleLinear()
                .domain([0, yMaxVal])
                .range([chartHeight - margin.bottom, margin.top]);

            let xAxis, yAxis;
            let xAxisUpdate = d3.axisBottom(x).ticks(5);
            let yAxisUpdate = d3.axisLeft(y);
            if (options.yAxis == PERCENTAGE)
                yAxisUpdate.ticks(6, "%");
            else
                yAxisUpdate.ticks(6);

            if (chart.selectAll('.axis').empty()) {
                xAxis = chart.append("g")
                    .attr("class", "axis axis--x")
                    .attr("transform", "translate(0," + (chartHeight - margin.bottom) + ")");

                yAxis = chart.append("g")
                    .attr("class", "axis axis--y")
                    .attr("transform", "translate(" + margin.left + ",0)");
            } else {
                xAxis = chart.selectAll('.axis--x');
                yAxis = chart.selectAll('.axis--y');
            }
            xAxis
                .transition()
                .duration(transitionDuration)
                .call(xAxisUpdate)
            yAxis
                .transition()
                .duration(transitionDuration)
                .call(yAxisUpdate);

            const valueline = d3.line()
                .curve(d3.curveBasis)
                .x(function (d) { return x(d[0]); })
                .y(function (d) { return y(d[1]); });

            const lines = chart
                .selectAll("path.lines")
                .data(data);

            lines.enter().append('path')
                .attr('class', 'lines');

            lines
                .transition()
                .duration(transitionDuration)
                .attr("fill", "none")
                .attr("stroke", "#000")
                .attr("stroke-width", 1.5)
                .attr("stroke-linejoin", "round")
                .attr("d", valueline);
        }

    }

    function getGraph(data) {
        const graph = {
            nodes: Object.keys(data)
                .map(k => ({
                    id: k,
                    group: NORMAL,
                    degree: data[k].length,
                    clusteringCoefficient: getClusteringCoefficient(k, data),
                    random: Math.random()
                })),
            links: Object.keys(data).map(k => data[k]
                .map(e => ({
                    source: k,
                    target: e,
                    group: NORMAL
                })))
                .reduce(function (a, b) {
                    return a.concat(b);
                }, [])
        };
        return graph;
    }

    function getClusteringCoefficient(k, data) {
        const neighbors = data[k];
        const n = neighbors.length;
        if (n <= 1)
            return 0;
        const connectedNeighbors = d3.sum(neighbors, n => data[n].filter(n2 => neighbors.includes(n2)).length);
        return connectedNeighbors / n / (n - 1);
    }

    function ticked() {
        link
            .attr("x1", function (d) { return d.source.x; })
            .attr("y1", function (d) { return d.source.y; })
            .attr("x2", function (d) { return d.target.x; })
            .attr("y2", function (d) { return d.target.y; });

        node
            .attr("x", function (d) { return d.x; })
            .attr("y", function (d) { return d.y; });
    }

    function removeVertex(d) {
        delete rawDataTmp[d.id];
        Object.values(rawDataTmp).filter(r => r.includes(d.id)).forEach(r => {
            var index = r.indexOf(d.id);
            r.splice(index, 1);
        });
        var index = graph.nodes.indexOf(d);
        if (index > -1) {
            graph.nodes.splice(index, 1);
        }
        do {
            let i = graph.links.map(l => l.source).indexOf(d);
            if (i === -1)
                i = graph.links.map(l => l.target).indexOf(d);
            if (i === -1)
                break;
            graph.links.splice(i, 1);
        } while (true);
        graph.nodes.forEach(n => {
            n.degree = rawDataTmp[n.id].length;
            n.clusteringCoefficient = getClusteringCoefficient(n.id, rawDataTmp);
        });
    }

    function getOptions() {
        const textInputs = [...document.querySelectorAll('input[type=text]')];
        const radioButtons = [...document.querySelectorAll('input[type=radio]')];
        const checkboxes = [...document.querySelectorAll('input[type=checkbox]')];
        const selectOptions = [...document.querySelectorAll('option')];
        const options = {};
        checkboxes.forEach(c => {
            options[c.name] = c.checked;
        });
        textInputs.forEach(t => {
            options[t.name] = t.value;
        });
        radioButtons.filter(b => b.checked).forEach(b => {
            options[b.name] = b.value;
        });
        selectOptions.filter(o => o.selected).forEach(o => {
            options[o.parentNode.name] = o.value;
        });
        return options;
    }

    function setNodeToDelete(n) {
        const ls = graph.links.filter(l => l.source == n || l.target == n);
        n.group = TO_BE_REMOVED;
        ls.forEach(l => l.group = TO_BE_REMOVED);
    }

    function setNodeNotToDelete(n) {
        const ls = graph.links.filter(l => l.source == n || l.target == n);
        n.group = NORMAL;
        ls.forEach(l => l.group = NORMAL);
    }


    function chooseNodes(choiceParameter, k) {
        const maxVal = d3.max(graph.nodes.map(n => n[choiceParameter]));
        const n = graph.nodes.find(n => n[choiceParameter] == maxVal);
        graph.nodes.sort((n1, n2) => n2[choiceParameter] - n1[choiceParameter]);
        return graph.nodes.slice(0, k);
    }

    function cleanAttack() {
        graph.nodes.filter(n => n.group == TO_BE_REMOVED).forEach(n => n.group = NORMAL);
        graph.links.filter(l => l.group == TO_BE_REMOVED).forEach(l => l.group = NORMAL);
    }

    function startAttack() {
        giantComponentSizes = [];
        averageDegrees = [];
        stopTimer();
        cleanAttack();
        status = ATTACK;
        draw();
        options = getOptions();
        let nodeToBeRemoved;
        timer = d3.interval(function () {
            iteration++;
            if (nodeToBeRemoved)
                removeVertex(nodeToBeRemoved);
            nodeToBeRemoved = chooseNodes(options.attackParameter, 1)[0];
            setNodeToDelete(nodeToBeRemoved);
            giantComponentSizes.push(cachedGiantComponentSize);
            averageDegrees.push(stats[2]['val']);
            draw();
        }, +options.speed, d3.now());
    }

    function getGiantComponentSize() {
        if (cachedGiantComponentSize && status == CONTAGION)
            return cachedGiantComponentSize;
        const graph2 = getGraph(rawDataTmp);
        const componentSizes = [];
        do {
            let i = 0;
            const n = graph2.nodes.find(n => !n.visited);
            if (!n)
                break;
            let nodesToBeVisited = [n];
            while (nodesToBeVisited.length) {
                let el = null;
                do {
                    el = nodesToBeVisited.pop();
                } while (el.visited && nodesToBeVisited.length);
                if (!el)
                    break;
                el.visited = true;
                const neighbors = rawDataTmp[el.id];
                i++;
                const neighborsToVisit = neighbors.map(e => graph2.nodes.find(n => n.id == e)).filter(e => !e.visited);
                nodesToBeVisited.push(...neighborsToVisit);
            }
            componentSizes.push(i);
        } while (true);
        const giantComponentSize = d3.max(componentSizes);
        cachedGiantComponentSize = giantComponentSize;
        return giantComponentSize;
    }

    function getStats() {
        function format(v) {
            return d3.format(".2n")(v);
        }
        const nodes = graph.nodes.length;
        const giantComponentSize = getGiantComponentSize();
        const averageDegree = d3.mean(graph.nodes, n => n.degree);
        const averageClusteringCoefficient = d3.mean(graph.nodes, n => n.clusteringCoefficient);
        const infectedNodes = graph.nodes.filter(n => n.group === INFECTED);
        return [
            { label: 'Number of nodes', val: nodes },
            { label: 'Giant component size', val: giantComponentSize },
            { label: 'Avg degree', val: format(averageDegree) },
            { label: 'Avg clustering coefficient', val: format(averageClusteringCoefficient) },
            { label: 'Non infected nodes', val: nodes - infectedNodes.length },
            { label: 'Infected nodes', val: infectedNodes.length }
        ];
    }

    function cleanContagion() {
        graph.nodes.filter(n => n.group == INFECTED).forEach(n => n.group = NORMAL);
    }

    function startContagion() {
        stopTimer();
        cleanContagion();
        cleanAttack();
        status = CONTAGION;
        draw();
        options = getOptions();
        const payoffs = { [NORMAL]: options.payoff1, [INFECTED]: options.payoff2 };
        let infectedNodes = chooseNodes(options.attackParameter, options.k);
        infectedNodes.forEach(n => n.group = INFECTED);
        timer = d3.interval(function () {
            iteration++;
            draw();
            updateContagion(payoffs);
        }, +options.speed, d3.now());
    }

    function stopTimer() {
        iteration = 0;
        if (timer)
            timer.stop();
        status = WAITING;
    }

    function stop() {
        stopTimer();
        draw();
    }

    function updateContagion(payoffs) {
        graph.nodes.forEach(n => {
            const neighbors = graph.links.filter(l => l.source == n).map(l => l.target);
            const nonInfectedNeighbors = neighbors.filter(l => l.group == NORMAL);
            const infectedNeighbors = neighbors.filter(l => l.group == INFECTED);
            const nonInfectionScore = nonInfectedNeighbors.length * payoffs[NORMAL];
            const infectionScore = infectedNeighbors.length * payoffs[INFECTED];
            n.infected = nonInfectionScore < infectionScore;
        });
        graph.nodes.forEach(n => {
            n.group = n.infected ? INFECTED : NORMAL;
        });
    }

    function loadEvents() {
        const buttons = document.querySelectorAll('button');
        buttons.forEach(b => b.addEventListener('click', () => {
            const id = b.id;
            window[id]();
        }));
    }