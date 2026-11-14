from django.contrib import admin
from django.core.exceptions import PermissionDenied
from django.template.response import TemplateResponse

from .models import ReviewItem, Review, UpstreamApiUsage
from .utils import api_usage

admin.site.register(ReviewItem)
admin.site.register(Review)


@admin.register(UpstreamApiUsage)
class UpstreamApiUsageAdmin(admin.ModelAdmin):
    """External API usage against quotas, as a read-only admin page.

    The list page shows the usage summary instead of the rows. The counts are
    written by the providers, never by hand.
    """

    def has_module_permission(self, request):
        # Any staff user, without a model permission, like the old /api/usage/.
        return request.user.is_active and request.user.is_staff

    def has_view_permission(self, request, obj=None):
        return self.has_module_permission(request)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def change_view(self, request, object_id, form_url='', extra_context=None):
        raise PermissionDenied

    def changelist_view(self, request, extra_context=None):
        if not self.has_view_permission(request):
            raise PermissionDenied
        return TemplateResponse(request, 'review/api_usage.html', {
            **self.admin_site.each_context(request),
            'title': 'API usage',
            'opts': self.model._meta,
            **api_usage.usage_summary(),
            **(extra_context or {}),
        })
