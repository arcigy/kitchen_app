/** @odoo-module **/
import { Component, onWillStart, useState, xml, useExternalListener } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService, useBus } from "@web/core/utils/hooks";
import { user } from "@web/core/user";
import { kanbanView } from "@web/views/kanban/kanban_view";
import { listView } from "@web/views/list/list_view";
import { formView } from "@web/views/form/form_view";

function liveView(view) {
    return { ...view, Controller: class extends view.Controller {
        setup() {
            super.setup();
            useBus(this.env.bus, "ARCIGY_FEEDBACK_UPDATED", async () => {
                await this.model.load();
            });
        }
    }};
}
registry.category("views").add("arcigy_feedback_list", liveView(listView));
registry.category("views").add("arcigy_feedback_kanban", liveView(kanbanView));
registry.category("views").add("arcigy_feedback_form", { ...formView, Controller: class extends formView.Controller {
    setup() {
        super.setup();
        const orm = useService("orm");
        onWillStart(async () => {
            if (this.props.resId) await orm.call("project.task", "arcigy_inbox", [], {read_task_id: this.props.resId});
            this.env.bus.trigger("ARCIGY_FEEDBACK_READ");
        });
    }
}});

class FeedbackInbox extends Component {
    static template = xml`<button t-if="state.enabled" class="btn btn-link text-reset px-2" aria-label="Arcigy podpora" t-on-click="open"><i class="fa fa-bell-o"/><span t-if="state.count" class="badge bg-danger ms-1" t-esc="state.count"/></button>`;
    static props = {};
    setup() {
        this.state = useState({count: 0, enabled: false});
        this.orm = useService("orm");
        this.action = useService("action");
        const bus = useService("bus_service");
        const notification = useService("notification");
        onWillStart(async () => {
            this.state.enabled = await user.hasGroup("arcigy_feedback.group_manager");
            if (this.state.enabled) await this.refresh();
        });
        bus.subscribe("arcigy.feedback/new", async (report) => {
            if (!this.state.enabled) return;
            await this.refresh();
            this.env.bus.trigger("ARCIGY_FEEDBACK_UPDATED");
            notification.add(`${report.company}: ${report.title}`, {
                title: `Nové hlásenie · ${report.environment}`, type: "info",
                buttons: [{name: "Otvoriť", primary: true, onClick: () => this.openReport(report.id)}],
            });
        });
        useBus(this.env.bus, "ARCIGY_FEEDBACK_READ", () => this.refresh());
        useExternalListener(window, "focus", () => {
            if (this.state.enabled) this.refresh();
        });
    }
    async refresh() { this.state.count = (await this.orm.call("project.task", "arcigy_inbox", [])).count; }
    open() { return this.action.doAction("arcigy_feedback.action"); }
    async openReport(id) {
        const action = await this.orm.call("project.task", "arcigy_open_report", [], {task_id: id});
        return this.action.doAction(action);
    }
}
registry.category("systray").add("arcigy.feedback.inbox", {Component: FeedbackInbox}, {sequence: 5});
