<script lang="ts">
    import { fly } from "svelte/transition";
    import { tick } from "svelte";
    import type { PlayerMapObject } from "../../doom";
    import STText from "../Components/STText.svelte";
    import { useAppContext } from "../DoomContext";

    const { visibleHudMessages } = useAppContext().settings;
    export let player: PlayerMapObject;
    const hudMessage = player.hudMessage;

    const messageTimeMS = 4000;

    // A neat little hack (IMO). We don't need a list of messages but instead put each message into the DOM and let the
    // animation api remove them when they expire. We need separate two DOM nodes to separate in/out transition though
    // and we use a scroll bar in the messageView to control how many messages are displayed at a time.
    // There is still an annoying jiggle when elements are removed but I'm not yet sure how to remove that but I'll keep thinking...
    let messageView: HTMLDivElement;
    let message = '';
    // without mesage number, we would only see the first of duplicate messages
    let messageNumber = 0;
    $: handleHudMessage($hudMessage);
    async function handleHudMessage(text: string) {
        message = text.toUpperCase();
        messageNumber += 1;
        await tick();
        $hudMessage = '';
        messageView?.scroll({ top: messageView.scrollHeight, behavior: 'smooth' });
    }
</script>

<div
    bind:this={messageView}
    class="messages select-none"
    style="--visible-messages:{$visibleHudMessages}"
>
    {#key messageNumber}
        <div out:fly={{ y: -8, delay: messageTimeMS }}>
            <div in:fly={{ y: -8 }}>
                <STText text={message} />
            </div>
        </div>
    {/key}
</div>

<style>
    .messages {
        position: absolute;
        padding-bottom: 3.5px;
        top: -3px;
        left: 0;
        transform: scale(2);
        transform-origin: top left;
        display: flex;
        flex-direction: column;
        gap: 1px;
        /* Only show n messages: n * (7px + gap) (2px gap because each message is a message + blank message) */
        max-height: calc(var(--visible-messages) * (7px + 2px));
        overflow-y: scroll;
        scrollbar-width: none;
    }
    .messages::-webkit-scrollbar {
        display: none;
    }
</style>