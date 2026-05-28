from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('HAC', '0003_alter_owners_phone'),
    ]

    operations = [
        migrations.AlterField(
            model_name='owners',
            name='phone',
            field=models.CharField(max_length=15, unique=False),
        ),
    ]
