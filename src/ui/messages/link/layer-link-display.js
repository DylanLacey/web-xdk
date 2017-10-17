/**
 *
 * @class layerUI.handlers.message.messageViewer
 * @extends layerUI.components.Component
 */
import { registerComponent } from '../../components/component';
import CardMixin from '../message-display-mixin';
import { registerMessageActionHandler } from '../../base';

registerComponent('layer-link-display', {
  mixins: [CardMixin],

  // This style contains rules that impacts the container that contains the url card
  // This will not translate well to shadow-dom.
  style: `
  layer-message-viewer.layer-link-display layer-standard-display-container {
    cursor: pointer;
    display: block;
  }
  layer-link-display img[src=''] {
    display: none;
  }
  layer-link-display img {
    width: 100%;
  }
  .layer-card-width-flex-width layer-link-display a {
    display: none;
  }
  `,

  template: '<img layer-id="image" class="layer-link-display-image" /><a target="_blank" layer-id="link"></a>',
  properties: {
    widthType: {
      get() {
        return this.model.imageUrl || this.parentComponent.isShowingMetadata ? 'flex-width' : 'chat-bubble';
      },
    },
    messageViewContainerTagName: {
      noGetterFromSetter: true,
      value: 'layer-standard-display-container',
    },
  },
  methods: {

    onCreate() {

    },

    onRender() {
      this.onRerender();
    },


    /**
     *
     * @method
     */
    onRerender() {
      this.messageViewer.toggleClass('layer-message-as-chat-bubble',
        !this.model.title && !this.model.author && !this.model.imageUrl && !this.model.description);
      this.nodes.image.src = this.model.imageUrl || '';
      this.nodes.link.src = this.model.url;
      this.nodes.link.innerHTML = this.model.url;
    },
    setupContainerClasses() {
      if (this.widthType) {
        const isLinkOnly = this.widthType === 'chat-bubble';
        const op = isLinkOnly || this.model.imageUrl ? 'remove' : 'add';
        this.parentComponent.classList[op]('layer-arrow-next-container');
        this.parentComponent.classList[this.model.imageUrl || isLinkOnly ? 'remove' : 'add']('layer-no-core-ui');
      }
    },
  },
});

registerMessageActionHandler('open-url', function openUrlHandler(customData) {
  const url = customData.url || this.model.url;
  if (url) window.open(url);
});