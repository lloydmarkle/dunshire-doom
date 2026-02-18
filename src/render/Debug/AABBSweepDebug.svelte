<script lang="ts">
    import { Vector3 } from "three";
    import { sweepAABBLine, sweepAABBAABB, lineAABB, lineBounds, lineFromVertexes } from "../../doom";

    const worldSize = 250;

    let mobj1 = {
        position: new Vector3(),
        velocity: new Vector3(10, 0, 0),
        radius: 5,
    }
    let mobj2 = {
        position: new Vector3(40),
        velocity: new Vector3(-10, 0, 0),
        radius: 5,
    }
    let line = {
        start: new Vector3(100, -100, 0),
        end: new Vector3(100, 100, 0),
    }

    function dragPoint(node: SVGElement, v: Vector3) {
        let moveStart = new Vector3();
        let moveDelta = new Vector3();
        const move = ev => {
            let p = new DOMPoint(ev.clientX, ev.clientY);
            let sp = p.matrixTransform(ev.target.getScreenCTM().inverse());
            v.add(moveDelta.set(sp.x, sp.y, 0).sub(moveStart));
            moveStart.set(sp.x, sp.y, 0);
            // hack to get dom reactive
            mobj1 = mobj1;
            mobj2 = mobj2;
            line = line;
        }
        const down = (ev) => {
            let p = new DOMPoint(ev.clientX, ev.clientY);
            let sp = p.matrixTransform(ev.target.getScreenCTM().inverse());
            moveStart.set(sp.x, sp.y, 0);
            document.addEventListener('pointermove', move)
        }
        const up = (ev) => {
            document.removeEventListener('pointermove', move);
        }

        node.addEventListener('pointerdown', down);
        document.addEventListener('pointerup', up);
        return {
            destroy() {
                node.removeEventListener('pointerdown', down);
                document.removeEventListener('pointerup', up);
            }
        };
    }

    $: hit1 = { ...sweepAABBLine(mobj1.position, mobj1.radius, mobj1.velocity, lineFromVertexes(line.start, line.end)) };
    $: hit2 = { ...lineAABB(lineFromVertexes(line.start, line.end), mobj1.position, mobj1.radius) };
    $: hit3 = { ...sweepAABBAABB(mobj1.position, mobj1.radius, mobj1.velocity, mobj2.position, mobj2.radius) };
    $: hit4 = { ...lineAABB(lineFromVertexes(line.start, line.end), mobj1.position, mobj1.radius, false) };
    $: hit5 = lineBounds(lineFromVertexes(line.start, line.end), {
        left: mobj1.position.x - mobj1.radius,
        right: mobj1.position.x + mobj1.radius,
        top: mobj1.position.y - mobj1.radius,
        bottom: mobj1.position.y + mobj1.radius,
    });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
AABB-Line Collision
Thing Radius {mobj1.radius}px <input type="range" min="0" max="20" bind:value={mobj1.radius} />
Thing Radius {mobj2.radius}px <input type="range" min="0" max="20" bind:value={mobj2.radius} />
<svg
    viewBox={`-${worldSize} -${worldSize} ${worldSize * 2} ${worldSize * 2}`}
>
    <line x1={line.start.x} y1={line.start.y} x2={line.end.x} y2={line.end.y} stroke={'orange'} />
    <circle cx={line.start.x} cy={line.start.y} r={1} fill="yellow" use:dragPoint={line.start}  />
    <circle cx={line.end.x} cy={line.end.y} r={1} fill="green" use:dragPoint={line.end}  />

    <rect x={mobj1.position.x - mobj1.radius} y={mobj1.position.y - mobj1.radius} width={mobj1.radius * 2} height={mobj1.radius * 2} stroke="blue" use:dragPoint={mobj1.position} />
    <line x1={mobj1.position.x} y1={mobj1.position.y} x2={mobj1.position.x + mobj1.velocity.x} y2={mobj1.position.y + mobj1.velocity.y} stroke={'magenta'} />
    <circle cx={mobj1.position.x + mobj1.velocity.x} cy={mobj1.position.y + mobj1.velocity.y} r={2} fill="magenta" use:dragPoint={mobj1.velocity} />

    <rect x={mobj2.position.x - mobj2.radius} y={mobj2.position.y - mobj2.radius} width={mobj2.radius * 2} height={mobj2.radius * 2} stroke="red" use:dragPoint={mobj2.position} />
    <line x1={mobj2.position.x} y1={mobj2.position.y} x2={mobj2.position.x + mobj2.velocity.x} y2={mobj2.position.y + mobj2.velocity.y} stroke={'magenta'} />
    <circle cx={mobj2.position.x + mobj2.velocity.x} cy={mobj2.position.y + mobj2.velocity.y} r={2} fill="magenta" use:dragPoint={mobj2.velocity} />

    {#if hit1.x !== undefined}
        <g opacity={.6}>
            <rect x={hit1.x - mobj1.radius} y={hit1.y - mobj1.radius} width={mobj1.radius * 2} height={mobj1.radius * 2} stroke="blue" />
            <circle cx={hit1.x} cy={hit1.y} r={2} fill="cyan" />
        </g>
    {/if}
    {#if hit2.x !== undefined}
        <g opacity={.6}>
            <circle cx={hit2.x} cy={hit2.y} r={2} fill="limegreen" />
        </g>
    {/if}
    {#if hit3.x !== undefined}
        <g opacity={.6}>
            <rect x={hit3.x - mobj1.radius} y={hit3.y - mobj1.radius} width={mobj1.radius * 2} height={mobj1.radius * 2} stroke="green" />
            <circle cx={hit3.x} cy={hit3.y} r={2} fill="cyan" />
        </g>
    {/if}
    {#if hit4.x !== undefined}
        <g opacity={.6}>
            <circle cx={hit4.x} cy={hit4.y} r={2} fill="yellow" />
        </g>
    {/if}
    {#if hit5}
        <g opacity={.6}>
            <circle cx={hit5[0].x} cy={hit5[0].y} r={2} fill="violet" />
            <circle cx={hit5[1].x} cy={hit5[1].y} r={2} fill="violet" />
        </g>
    {/if}
</svg>

<style>
    g {
        pointer-events: none;
    }
</style>